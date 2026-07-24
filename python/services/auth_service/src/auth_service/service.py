"""Auth business logic, refactored from the original flat user_service.py.

Preserved behaviors: username normalization, password policy, unique-username
generation for SSO accounts, role validation. New: refresh rotation with reuse
detection, Redis sessions, revocation, UserCreated/UserUpdated events.
"""

import time
import uuid

import jwt as pyjwt
from ecom_common.auth import Role, TokenPayload, decode_token
from ecom_common.errors import ConflictError, DomainValidationError, ForbiddenError, UnauthorizedError
from ecom_common.events import EventType, Topics, make_event
from ecom_common.logging import get_logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth_service.config import Settings
from auth_service.models import User
from auth_service.schemas import SSOLoginRequest, TokenPair, UserSignup
from auth_service.security import (
    create_access_token,
    create_refresh_token,
    extract_google_profile,
    hash_password,
    is_password_strong,
    normalize_username,
    verify_password,
)
from auth_service.sessions import SessionStore

log = get_logger("auth.service")


class AuthService:
    def __init__(self, settings: Settings, sessions: SessionStore, producer=None):
        self.settings = settings
        self.sessions = sessions
        self.producer = producer  # optional EventProducer; None until Kafka is up (Phase 2)

    # ------------------------------------------------------------------ users

    async def register(self, payload: UserSignup, db: AsyncSession, *, actor: TokenPayload | None = None) -> User:
        username = normalize_username(payload.username)
        if len(username) < 3:
            raise DomainValidationError("Username must be at least 3 characters")
        if not is_password_strong(payload.password):
            raise DomainValidationError(
                "Password must be at least 8 characters and include uppercase, lowercase, number, and special character"
            )

        role = payload.role or Role.CUSTOMER
        if role != Role.CUSTOMER and (actor is None or actor.role != Role.ADMIN):
            raise ForbiddenError("Only ADMIN can create privileged accounts")

        if await self._username_taken(db, username):
            raise ConflictError("Username already registered")
        if payload.email and await self._email_taken(db, payload.email):
            raise ConflictError("Email already registered")

        user = User(
            username=username,
            email=payload.email,
            hashed_password=hash_password(payload.password),
            role=role.value,
            provider="local",
            is_active=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        log.info("user_registered", username=username, role=user.role)
        await self._publish_user_event(EventType.USER_CREATED, user)
        return user

    async def authenticate(self, username: str, password: str, db: AsyncSession) -> User:
        user = (await db.execute(select(User).filter(User.username == normalize_username(username)))).scalars().first()
        if not user or not user.hashed_password or not verify_password(password, user.hashed_password):
            raise UnauthorizedError("Incorrect username or password")
        if not user.is_active:
            raise ForbiddenError("User is inactive")
        return user

    async def get_user(self, user_id: str, db: AsyncSession) -> User | None:
        try:
            uid = uuid.UUID(user_id)
        except ValueError:
            return None
        return await db.get(User, uid)

    # ----------------------------------------------------------------- tokens

    async def issue_token_pair(self, user: User, *, user_agent: str = "") -> TokenPair:
        sid = str(uuid.uuid4())
        access, _access_jti = create_access_token(
            self.settings, user_id=str(user.id), email=user.email, username=user.username, role=user.role, sid=sid
        )
        refresh, refresh_jti = create_refresh_token(self.settings, user_id=str(user.id), sid=sid)
        await self.sessions.create_session(sid=sid, user_id=str(user.id), refresh_jti=refresh_jti, user_agent=user_agent)
        return TokenPair(
            access_token=access,
            refresh_token=refresh,
            expires_in=self.settings.access_token_expire_minutes * 60,
            role=Role(user.role),
        )

    async def refresh_tokens(self, refresh_token: str, db: AsyncSession) -> TokenPair:
        payload = decode_token(
            refresh_token,
            secret=self.settings.jwt_secret,
            algorithm=self.settings.jwt_algorithm,
            issuer=self.settings.jwt_issuer,
            audience=self.settings.jwt_audience,
            expected_typ="refresh",
        )
        if not payload.sid:
            raise UnauthorizedError("Malformed refresh token")

        session = await self.sessions.get_session(payload.sid)
        if session is None:
            raise UnauthorizedError("Session expired or revoked")

        if session.get("current_refresh_jti") != payload.jti:
            # Valid signature but stale jti: the token was already rotated away.
            # Treat as theft — kill the whole session (refresh reuse detection).
            await self.sessions.destroy_session(payload.sid)
            log.warning("refresh_reuse_detected", sid=payload.sid, user_id=payload.sub)
            raise UnauthorizedError("Refresh token reuse detected; session revoked")

        user = await self.get_user(payload.sub, db)
        if user is None or not user.is_active:
            await self.sessions.destroy_session(payload.sid)
            raise UnauthorizedError("User no longer active")

        access, _ = create_access_token(
            self.settings, user_id=str(user.id), email=user.email, username=user.username, role=user.role, sid=payload.sid
        )
        new_refresh, new_jti = create_refresh_token(self.settings, user_id=str(user.id), sid=payload.sid)
        await self.sessions.rotate_refresh(sid=payload.sid, old_jti=payload.jti, new_jti=new_jti)
        return TokenPair(
            access_token=access,
            refresh_token=new_refresh,
            expires_in=self.settings.access_token_expire_minutes * 60,
            role=Role(user.role),
        )

    async def logout(self, access_payload: TokenPayload) -> None:
        remaining = max(0, access_payload.exp - int(time.time()))
        await self.sessions.denylist_access_jti(access_payload.jti, remaining)
        if access_payload.sid:
            await self.sessions.destroy_session(access_payload.sid)

    async def logout_all(self, access_payload: TokenPayload) -> int:
        remaining = max(0, access_payload.exp - int(time.time()))
        await self.sessions.denylist_access_jti(access_payload.jti, remaining)
        return await self.sessions.destroy_all_sessions(access_payload.sub)

    # -------------------------------------------------------------------- sso

    async def sso_login(self, payload: SSOLoginRequest, db: AsyncSession) -> User:
        provider = (payload.provider or "sso").lower()
        subject = (payload.subject or "").strip()
        if not subject:
            raise DomainValidationError("SSO subject is required")

        if provider == "google":
            profile = extract_google_profile(payload.model_dump())
            subject = profile["subject"]
            payload.email = profile["email"] or payload.email
            payload.display_name = profile["display_name"] or payload.display_name

        user = (
            (await db.execute(select(User).filter(User.provider_sub == subject, User.provider == provider))).scalars().first()
        )
        if user is None:
            username = await self._unique_username(db, payload.display_name or payload.email or f"{provider}-{subject}")
            user = User(
                username=username,
                email=payload.email,
                provider=provider,
                provider_sub=subject,
                hashed_password=None,  # passwordless SSO account
                role=Role.CUSTOMER.value,
                is_active=True,
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)
            log.info("sso_user_created", username=username, provider=provider)
            await self._publish_user_event(EventType.USER_CREATED, user)
        if not user.is_active:
            raise ForbiddenError("User is inactive")
        return user

    # ---------------------------------------------------------------- helpers

    async def _username_taken(self, db: AsyncSession, username: str) -> bool:
        return (await db.execute(select(User.id).filter(User.username == username))).first() is not None

    async def _email_taken(self, db: AsyncSession, email: str) -> bool:
        return (await db.execute(select(User.id).filter(User.email == email))).first() is not None

    async def _unique_username(self, db: AsyncSession, base: str) -> str:
        """Preserved from the original sso_login: append a numeric suffix until free."""
        base_username = normalize_username(base).replace(" ", "")[:40] or "user"
        username = base_username
        suffix = 1
        while await self._username_taken(db, username):
            username = f"{base_username}{suffix}"
            suffix += 1
        return username

    async def _publish_user_event(self, event_type: str, user: User) -> None:
        if self.producer is None:
            return
        try:
            await self.producer.publish(
                Topics.USER,
                make_event(
                    event_type=event_type,
                    producer=self.settings.service_name,
                    partition_key=str(user.id),
                    payload={
                        "user_id": str(user.id),
                        "username": user.username,
                        "email": user.email,
                        "role": user.role,
                        "provider": user.provider,
                    },
                ),
            )
        except Exception:
            # Event publishing must never fail the auth flow; consumers reconcile later.
            log.exception("user_event_publish_failed", event_type=event_type)


def decode_google_id_token(token: str, client_id: str) -> dict | None:
    """Verify a Google ID token. Kept from oauth_service.py, minus the bugs."""
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token as google_id_token

    try:
        return google_id_token.verify_oauth2_token(token, google_requests.Request(), client_id)
    except (ValueError, pyjwt.PyJWTError):
        return None
