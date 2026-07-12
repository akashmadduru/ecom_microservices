"""Password hashing and token minting.

Token *verification* lives in ecom_common.auth so every service can do it;
minting is auth-service-only. bcrypt is used directly (passlib is abandoned and
incompatible with bcrypt>=4); existing $2b$ hashes verify unchanged.
"""

import re
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt

from auth_service.config import Settings

PASSWORD_POLICY = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$")


def normalize_username(value: str) -> str:
    return value.strip().lower()


def is_password_strong(password: str) -> bool:
    return bool(password) and bool(PASSWORD_POLICY.match(password))


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def extract_google_profile(claims: dict[str, Any]) -> dict[str, Any]:
    email = (claims.get("email") or "").strip().lower()
    given_name = (claims.get("given_name") or "").strip()
    family_name = (claims.get("family_name") or "").strip()
    display_name = " ".join(p for p in [given_name, family_name] if p).strip() or email.split("@", 1)[0]
    return {
        "subject": str(claims.get("sub") or "").strip(),
        "email": email,
        "display_name": display_name,
        "provider": "google",
    }


def _base_claims(settings: Settings, *, sub: str, sid: str, typ: str, lifetime: timedelta) -> dict[str, Any]:
    now = datetime.now(UTC)
    return {
        "sub": sub,
        "sid": sid,
        "typ": typ,
        "jti": str(uuid.uuid4()),
        "iat": int(now.timestamp()),
        "nbf": int(now.timestamp()),
        "exp": int((now + lifetime).timestamp()),
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
    }


def create_access_token(settings: Settings, *, user_id: str, email: str | None, username: str, role: str, sid: str) -> tuple[str, str]:
    """Returns (token, jti)."""
    claims = _base_claims(settings, sub=user_id, sid=sid, typ="access", lifetime=timedelta(minutes=settings.access_token_expire_minutes))
    claims.update({"email": email, "username": username, "role": role})
    return jwt.encode(claims, settings.jwt_secret, algorithm=settings.jwt_algorithm), claims["jti"]


def create_refresh_token(settings: Settings, *, user_id: str, sid: str) -> tuple[str, str]:
    """Returns (token, jti)."""
    claims = _base_claims(settings, sub=user_id, sid=sid, typ="refresh", lifetime=timedelta(days=settings.refresh_token_expire_days))
    return jwt.encode(claims, settings.jwt_secret, algorithm=settings.jwt_algorithm), claims["jti"]
