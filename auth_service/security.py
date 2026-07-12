import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext

from config import ACCESS_TOKEN_EXPIRE_MINUTES, ALGORITHM, JWT_AUDIENCE, JWT_ISSUER, SECRET_KEY
from event import redis
from logger import log

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/signin")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
PASSWORD_POLICY = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$")


def normalize_username(value: str) -> str:
    return value.strip().lower()


def is_password_strong(password: str) -> bool:
    if not password:
        return False
    return bool(PASSWORD_POLICY.match(password))


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    try:
        return pwd_context.hash(password)
    except Exception as exc:
        log.error(f"Error hashing password: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error hashing password") from exc


def extract_google_profile(claims: Dict[str, Any]) -> Dict[str, Any]:
    email = (claims.get("email") or "").strip().lower()
    given_name = (claims.get("given_name") or "").strip()
    family_name = (claims.get("family_name") or "").strip()
    display_name = " ".join(part for part in [given_name, family_name] if part).strip() or email.split("@", 1)[0]
    return {
        "subject": str(claims.get("sub") or "").strip(),
        "email": email,
        "display_name": display_name,
        "provider": "google",
    }


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update(
        {
            "exp": int(expire.timestamp()),
            "iat": int(now.timestamp()),
            "nbf": int(now.timestamp()),
            "iss": JWT_ISSUER,
            "aud": JWT_AUDIENCE,
            "jti": str(uuid.uuid4()),
        }
    )
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(token: str = Depends(oauth2_scheme)):
    cache_key = f"token:{token}"
    if redis:
        cached_session = await redis.get(cache_key)
        if cached_session:
            username, role, uid = cached_session.split(":", 2)
            return {"username": username, "role": role, "id": int(uid)}

    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
            audience=JWT_AUDIENCE,
            issuer=JWT_ISSUER,
            options={"require": ["exp", "sub", "role"]},
        )
        username: str = payload.get("sub")
        role: str = payload.get("role")
        uid: int = payload.get("uid")
        if username is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token details")
        return {"username": username, "role": role, "id": uid}
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired") from exc
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials") from exc