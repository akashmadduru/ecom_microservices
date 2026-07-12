import time
import uuid

from fastapi import HTTPException, status
from sqlalchemy.future import select

from config import ACCESS_TOKEN_EXPIRE_MINUTES
from event import redis
from logger import log
from roles import ROLES
from security import create_access_token, extract_google_profile, get_password_hash, is_password_strong, normalize_username, verify_password
from users import User


class UserService:
    async def register(self, user, db):
        normalized_username = normalize_username(user.username)
        log.info(f"Attempting registration for user: {normalized_username}")

        if len(normalized_username) < 3:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Username must be at least 3 characters")

        if not is_password_strong(user.password):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Password must be at least 8 characters and include uppercase, lowercase, number, and special character",
            )

        requested_role = (user.role or ROLES["USER"]).upper()
        if requested_role not in ROLES.values():
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported role")

        result = await db.execute(select(User).filter(User.username == normalized_username))
        existing_user = result.scalars().first()
        if existing_user:
            log.warning(f"Registration failed: User {normalized_username} already exists.")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already registered")

        new_user = User(
            username=normalized_username,
            email=getattr(user, "email", None),
            provider=getattr(user, "provider", "local"),
            hashed_password=get_password_hash(user.password),
            role=requested_role,
            created_at=str(time.time()),
            updated_at=str(time.time()),
            is_active=True,
        )
        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)
        log.info(f"User {normalized_username} successfully registered with role {new_user.role}.")
        return {"id": new_user.id, "username": new_user.username, "role": new_user.role, "provider": new_user.provider}

    async def login_for_access_token(self, form_data, db):
        normalized_username = normalize_username(form_data.username)
        log.info(f"Login request for: {normalized_username}")

        result = await db.execute(select(User).filter(User.username == normalized_username))
        user = result.scalars().first()
        if not user or not verify_password(form_data.password, user.hashed_password):
            log.warning(f"Login failed: Invalid credentials for {normalized_username}")
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect username or password")

        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is inactive")

        access_token = create_access_token(
            data={"sub": user.username, "role": user.role, "uid": user.id, "scope": "access", "auth_provider": user.provider}
        )

        if redis:
            cache_key = f"token:{access_token}"
            await redis.setex(cache_key, ACCESS_TOKEN_EXPIRE_MINUTES * 60, f"{user.username}:{user.role}:{user.id}")
        log.info(f"Token cached in Redis for user {user.username}. Session initialized.")

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "role": user.role,
            "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        }

    async def sso_login(self, payload, db):
        provider = (payload.provider or "sso").lower()
        subject = (payload.subject or "").strip()
        if not subject:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="SSO subject is required")

        if provider == "google":
            google_profile = extract_google_profile(payload.model_dump())
            subject = google_profile["subject"]
            payload.email = google_profile["email"]
            payload.display_name = google_profile["display_name"]

        result = await db.execute(select(User).filter(User.sso_subject == subject, User.provider == provider))
        user = result.scalars().first()
        if not user:
            base_username = normalize_username(payload.display_name or payload.email or f"{provider}-{subject}")
            username = base_username
            suffix = 1
            while True:
                existing_user = (await db.execute(select(User).filter(User.username == username))).scalars().first()
                if not existing_user:
                    break
                username = f"{base_username}{suffix}"
                suffix += 1

            user = User(
                username=username,
                email=payload.email,
                provider=provider,
                sso_subject=subject,
                hashed_password=get_password_hash(f"sso:{provider}:{subject}:{uuid.uuid4().hex}"),
                role=ROLES["USER"],
                created_at=str(time.time()),
                updated_at=str(time.time()),
                is_active=True,
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)

        access_token = create_access_token(
            data={"sub": user.username, "role": user.role, "uid": user.id, "scope": "access", "auth_provider": user.provider}
        )
        if redis:
            cache_key = f"token:{access_token}"
            await redis.setex(cache_key, ACCESS_TOKEN_EXPIRE_MINUTES * 60, f"{user.username}:{user.role}:{user.id}")
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "role": user.role,
            "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        }

    async def admin_diagnostics(self, current_user: dict):
        if current_user["role"] != ROLES["ADMIN"]:
            log.warning(f"Unauthorized RBAC access attempt by {current_user['username']} on admin logs")
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Developer/Admin role required.")
        return {"status": "ok", "system_timestamp": time.time(), "authorized_by": current_user["username"]}