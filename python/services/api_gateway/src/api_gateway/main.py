import uuid
from contextlib import asynccontextmanager

from ecom_common.auth import DENYLIST_PREFIX, Role, TokenPayload, decode_token
from ecom_common.bootstrap import create_app
from ecom_common.errors import ForbiddenError, RateLimitedError, UnauthorizedError
from ecom_common.logging import get_logger
from ecom_common.redis import create_redis
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse

from api_gateway.config import get_settings
from api_gateway.proxy import UpstreamProxy
from api_gateway.ratelimit import RateLimiter
from api_gateway.route_table import PUBLIC, build_route_table, match_route

log = get_logger("gateway.main")

settings = get_settings()
API_PREFIX = "/api/v1"

SECURE_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
}

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.redis = create_redis(settings.redis_url)
    app.state.proxy = UpstreamProxy(
        connect_timeout=settings.upstream_connect_timeout_seconds,
        read_timeout=settings.upstream_read_timeout_seconds,
        write_timeout=settings.upstream_write_timeout_seconds,
        pool_timeout=settings.upstream_pool_timeout_seconds,
        circuit_breaker_failure_threshold=settings.circuit_breaker_failure_threshold,
        circuit_breaker_reset_timeout=settings.circuit_breaker_reset_timeout_seconds,
    )
    app.state.rate_limiter = RateLimiter(app.state.redis)
    app.state.routes = build_route_table(settings)
    log.info("gateway_started", routes=[r.prefix for r in app.state.routes])
    yield
    await app.state.proxy.aclose()
    await app.state.redis.aclose()


async def _check_redis() -> bool:
    return bool(await app.state.redis.ping())


app = create_app(
    settings=settings,
    title="E-Commerce API Gateway",
    description=(
        "Single entry point: JWT validation, RBAC, routing, rate limiting, circuit breaking. "
        "This service is a dynamic reverse proxy — its one functional route "
        "(`/api/v1/{path}`) is intentionally excluded from the OpenAPI schema, so this "
        "Swagger page only shows /healthz, /readyz, and /metrics. Browse each backend "
        "service's own /docs (auth :8001, product :8003, inventory :8004) for its documented API."
    ),
    readiness_checks={"redis": _check_redis},
    lifespan=lifespan,
    cors_origins=settings.cors_origins.split(","),
)


async def _authenticate(request: Request) -> TokenPayload | None:
    auth_header = request.headers.get("authorization", "")
    if not auth_header.lower().startswith("bearer "):
        return None
    token = auth_header.split(" ", 1)[1].strip()
    payload = decode_token(
        token,
        secret=settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
        issuer=settings.jwt_issuer,
        audience=settings.jwt_audience,
    )
    if await app.state.redis.exists(f"{DENYLIST_PREFIX}{payload.jti}"):
        raise UnauthorizedError("Token revoked")
    return payload


@app.api_route(API_PREFIX + "/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], include_in_schema=False)
async def gateway(request: Request, path: str) -> Response:
    sub_path = "/" + path
    if "/internal/" in sub_path or sub_path.startswith("/internal"):
        return JSONResponse(status_code=404, content={"error": {"code": "not_found", "message": "Not found"}})

    route = match_route(app.state.routes, sub_path)
    if route is None:
        return JSONResponse(status_code=404, content={"error": {"code": "not_found", "message": "No such route"}})

    # Authenticate whenever credentials are supplied; enforce depending on policy.
    user = await _authenticate(request)

    policy = route.policy_for(request.method)
    if policy != PUBLIC:
        if user is None:
            raise UnauthorizedError("Authentication required")
        if isinstance(policy, set) and user.role != Role.ADMIN and user.role not in policy:
            allowed = ", ".join(sorted(r.value for r in policy | {Role.ADMIN}))
            raise ForbiddenError(f"Requires one of roles: {allowed}")

    # Rate limit: per-user when authenticated, per-IP otherwise.
    client_ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown").split(",")[0].strip()
    identity = f"user:{user.sub}" if user else f"ip:{client_ip}"
    limit = settings.rate_limit_user_per_minute if user else settings.rate_limit_anonymous_per_minute
    allowed, remaining = await app.state.rate_limiter.check(identity, limit)
    if not allowed:
        raise RateLimitedError("Rate limit exceeded, slow down")

    correlation_id = getattr(request.state, "correlation_id", None) or str(uuid.uuid4())
    upstream_response = await app.state.proxy.forward(
        route,
        method=request.method,
        path=sub_path,
        query=request.url.query,
        headers=dict(request.headers),
        body=await request.body(),
        client_ip=client_ip,
        correlation_id=correlation_id,
        user=user,
    )

    response_headers = {k: v for k, v in upstream_response.headers.items() if k.lower() not in ("content-length", "transfer-encoding")}
    response_headers.update(SECURE_HEADERS)
    response_headers["X-RateLimit-Remaining"] = str(remaining)
    return Response(
        content=upstream_response.content,
        status_code=upstream_response.status_code,
        headers=response_headers,
        media_type=upstream_response.headers.get("content-type"),
    )
