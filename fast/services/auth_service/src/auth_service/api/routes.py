import time

from ecom_common.auth import Role, TokenPayload, require_roles
from ecom_common.errors import NotFoundError, UnauthorizedError
from fastapi import APIRouter, Depends, Request, status
from fastapi.security import OAuth2PasswordRequestForm

from auth_service.config import get_settings
from auth_service.deps import AuthServiceDep, CurrentToken, DbDep, get_current_token
from auth_service.schemas import GoogleLoginRequest, RefreshRequest, SSOLoginRequest, TokenPair, UserResponse, UserSignup
from auth_service.service import decode_google_id_token

router = APIRouter(prefix="/auth", tags=["auth"])


def _user_response(user) -> UserResponse:
    return UserResponse(
        id=str(user.id), username=user.username, email=user.email, role=Role(user.role), provider=user.provider, is_active=user.is_active
    )


@router.post(
    "/signup",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
    responses={409: {"description": "Username or email already taken"}},
)
async def signup(payload: UserSignup, db: DbDep, svc: AuthServiceDep):
    user = await svc.register(payload, db)
    return _user_response(user)


@router.post(
    "/signin",
    response_model=TokenPair,
    summary="Sign in with username/password",
    description="OAuth2 password grant form (username, password). Returns an access/refresh token pair.",
    responses={401: {"description": "Invalid credentials"}},
)
async def signin(request: Request, db: DbDep, svc: AuthServiceDep, form_data: OAuth2PasswordRequestForm = Depends()):
    user = await svc.authenticate(form_data.username, form_data.password, db)
    return await svc.issue_token_pair(user, user_agent=request.headers.get("user-agent", ""))


@router.post(
    "/token/refresh",
    response_model=TokenPair,
    summary="Rotate a refresh token",
    description="Exchanges a valid refresh token for a new access/refresh pair. Reuse of a rotated-away token kills the whole session.",
    responses={401: {"description": "Refresh token invalid, expired, or reused"}},
)
async def refresh_tokens(payload: RefreshRequest, db: DbDep, svc: AuthServiceDep):
    return await svc.refresh_tokens(payload.refresh_token, db)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Sign out",
    description="Denylists the current access token's jti and ends its session.",
)
async def logout(token: CurrentToken, svc: AuthServiceDep):
    await svc.logout(token)


@router.post(
    "/logout/all",
    status_code=status.HTTP_200_OK,
    summary="Sign out of every session",
    description="Revokes all active sessions for the calling user, returning how many were revoked.",
)
async def logout_all(token: CurrentToken, svc: AuthServiceDep):
    revoked = await svc.logout_all(token)
    return {"revoked_sessions": revoked}


@router.post("/sso/google", response_model=TokenPair)
async def sso_google_login(request: Request, payload: GoogleLoginRequest, db: DbDep, svc: AuthServiceDep):
    """Login with a Google ID token obtained by the frontend (One Tap / GIS)."""
    settings = get_settings()
    claims = decode_google_id_token(payload.token, settings.google_oauth2_client_id)
    if claims is None:
        raise UnauthorizedError("Invalid Google token")
    sso = SSOLoginRequest(provider="google", subject=str(claims["sub"]), email=claims.get("email"), display_name=claims.get("name"))
    user = await svc.sso_login(sso, db)
    return await svc.issue_token_pair(user, user_agent=request.headers.get("user-agent", ""))


@router.post("/sso/login", response_model=TokenPair)
async def sso_login(request: Request, payload: SSOLoginRequest, db: DbDep, svc: AuthServiceDep):
    """Generic SSO upsert for pre-verified identities (kept from the original API)."""
    user = await svc.sso_login(payload, db)
    return await svc.issue_token_pair(user, user_agent=request.headers.get("user-agent", ""))


@router.get("/sso/google/authorize")
async def sso_google_authorize(request: Request):
    """Start the server-side authorization-code flow: redirect the browser to Google."""
    from fastapi.responses import RedirectResponse

    from auth_service.oauth_google import create_authorize_url

    url = await create_authorize_url(get_settings(), request.app.state.redis)
    return RedirectResponse(url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)


@router.get("/sso/google/callback", response_model=TokenPair)
async def sso_google_callback(request: Request, code: str, state: str, db: DbDep, svc: AuthServiceDep):
    """Google redirects here with ?code=&state=; exchange, verify, and issue our tokens."""
    from auth_service.oauth_google import exchange_code

    settings = get_settings()
    id_token = await exchange_code(settings, request.app.state.redis, code=code, state=state)
    claims = decode_google_id_token(id_token, settings.google_oauth2_client_id)
    if claims is None:
        raise UnauthorizedError("Invalid Google token")
    sso = SSOLoginRequest(provider="google", subject=str(claims["sub"]), email=claims.get("email"), display_name=claims.get("name"))
    user = await svc.sso_login(sso, db)
    return await svc.issue_token_pair(user, user_agent=request.headers.get("user-agent", ""))


@router.get("/validate", response_model=UserResponse)
async def validate_token(token: CurrentToken, db: DbDep, svc: AuthServiceDep):
    user = await svc.get_user(token.sub, db)
    if user is None:
        raise NotFoundError("User not found")
    return _user_response(user)


@router.get("/users/me", response_model=UserResponse)
async def read_users_me(token: CurrentToken, db: DbDep, svc: AuthServiceDep):
    user = await svc.get_user(token.sub, db)
    if user is None:
        raise NotFoundError("User not found")
    return _user_response(user)


@router.get("/admin/diagnostics")
async def admin_diagnostics(token: TokenPayload = Depends(require_roles(get_current_token, Role.ADMIN))):
    return {"status": "ok", "system_timestamp": time.time(), "authorized_by": token.username or token.sub}


internal_router = APIRouter(prefix="/internal", tags=["internal"], include_in_schema=False)


@internal_router.get("/users/{user_id}", response_model=UserResponse)
async def internal_get_user(user_id: str, db: DbDep, svc: AuthServiceDep):
    """Service-to-service lookup used by the order saga's validate_user activity."""
    user = await svc.get_user(user_id, db)
    if user is None:
        raise NotFoundError("User not found")
    return _user_response(user)
