"""Google OAuth2 authorization-code flow (server-side).

Complements the ID-token flow kept from the original service: here the browser
is redirected to Google, and the auth service exchanges the returned code for
tokens itself. CSRF is covered by a Redis-backed `state` nonce.
"""

import secrets
from urllib.parse import urlencode

import httpx
from ecom_common.errors import UnauthorizedError, UpstreamError
from redis.asyncio import Redis

from auth_service.config import Settings

GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
STATE_TTL_SECONDS = 600


async def create_authorize_url(settings: Settings, redis: Redis) -> str:
    state = secrets.token_urlsafe(32)
    await redis.set(f"oauth:state:{state}", "1", ex=STATE_TTL_SECONDS)
    query = urlencode(
        {
            "client_id": settings.google_oauth2_client_id,
            "redirect_uri": settings.google_oauth2_redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "access_type": "offline",
            "prompt": "select_account",
        }
    )
    return f"{GOOGLE_AUTH_ENDPOINT}?{query}"


async def exchange_code(settings: Settings, redis: Redis, *, code: str, state: str) -> str:
    """Validates the CSRF state and exchanges the code; returns Google's ID token (JWT)."""
    if not await redis.getdel(f"oauth:state:{state}"):
        raise UnauthorizedError("Invalid or expired OAuth state")

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.post(
                GOOGLE_TOKEN_ENDPOINT,
                data={
                    "client_id": settings.google_oauth2_client_id,
                    "client_secret": settings.google_oauth2_client_secret,
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": settings.google_oauth2_redirect_uri,
                },
            )
        except httpx.HTTPError as exc:
            raise UpstreamError("Google token endpoint unreachable") from exc

    if response.status_code != 200:
        raise UnauthorizedError("Google code exchange failed")
    id_token = response.json().get("id_token")
    if not id_token:
        raise UnauthorizedError("Google response missing id_token")
    return id_token
