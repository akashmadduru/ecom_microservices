from enum import StrEnum
from typing import Annotated

import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from ecom_common.errors import ForbiddenError, UnauthorizedError

DENYLIST_PREFIX = "denylist:jti:"

_bearer = HTTPBearer(
    auto_error=False,
    bearerFormat="JWT",
    description="Paste the access token returned by POST /auth/signin",
)

class Role(StrEnum):
    CUSTOMER = "CUSTOMER"
    SELLER = "SELLER"
    ADMIN = "ADMIN"
    SUPPORT = "SUPPORT"

class TokenPayload(BaseModel):
    sub: str  # user id
    email: str | None = None
    username: str | None = None
    role: Role | None = None  # absent on refresh tokens, which carry minimal claims
    sid: str | None = None  # session id
    jti: str
    typ: str = "access"
    exp: int
    iat: int


def decode_token(token: str, *, secret: str, algorithm: str, issuer: str, audience: str, expected_typ: str = "access") -> TokenPayload:
    try:
        claims = jwt.decode(
            token,
            secret,
            algorithms=[algorithm],
            audience=audience,
            issuer=issuer,
            options={"require": ["exp", "sub", "jti"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise UnauthorizedError("Token expired") from exc
    except jwt.PyJWTError as exc:
        raise UnauthorizedError("Could not validate credentials") from exc

    payload = TokenPayload.model_validate(claims)
    if payload.typ != expected_typ:
        raise UnauthorizedError(f"Expected a {expected_typ} token")
    return payload


def build_get_current_user(get_settings):
    """Build the standard `get_current_user` dependency for a service.

    Verifies the JWT signature/claims and, when the app has a Redis client on
    `app.state.redis`, rejects revoked tokens via the jti denylist.
    """

    async def get_current_user(
        request: Request,
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    ) -> TokenPayload:
        if credentials is None:
            raise UnauthorizedError("Missing bearer token")
        settings = get_settings()
        payload = decode_token(
            credentials.credentials,
            secret=settings.jwt_secret,
            algorithm=settings.jwt_algorithm,
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
        )
        redis = getattr(request.app.state, "redis", None)
        if redis is not None and await redis.exists(f"{DENYLIST_PREFIX}{payload.jti}"):
            raise UnauthorizedError("Token revoked")
        request.state.user = payload
        return payload

    return get_current_user


def require_roles(get_user, *roles: Role):
    """Dependency factory: wraps a service's `get_current_user` dependency and
    allows only the given roles (ADMIN is always allowed). FastAPI's per-request
    dependency cache means the token is still only decoded once.
    """
    allowed = set(roles) | {Role.ADMIN}

    async def check(user: Annotated[TokenPayload, Depends(get_user)]) -> TokenPayload:
        if user.role not in allowed:
            raise ForbiddenError(f"Requires one of roles: {', '.join(sorted(r.value for r in allowed))}")
        return user

    return check
