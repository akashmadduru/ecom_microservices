from contextlib import asynccontextmanager

from ecom_common.bootstrap import create_app
from ecom_common.db import build_engine, build_session_factory
from ecom_common.logging import get_logger
from ecom_common.redis import create_redis
from fastapi import FastAPI

from auth_service.api.routes import internal_router, router
from auth_service.config import get_settings
from auth_service.service import AuthService
from auth_service.sessions import SessionStore

log = get_logger("auth.main")

settings = get_settings()

TAGS_METADATA = [
    {"name": "auth", "description": "Signup, signin, token refresh/rotation, logout, Google SSO, RBAC."},
    {"name": "internal", "description": "Service-to-service only; not routable through the gateway."},
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.engine = build_engine(settings.database_url)
    app.state.session_factory = build_session_factory(app.state.engine)
    app.state.redis = create_redis(settings.redis_url)
    sessions = SessionStore(app.state.redis, refresh_ttl_seconds=settings.refresh_token_expire_days * 24 * 3600)

    producer = None
    if settings.kafka_bootstrap_servers:
        try:
            from ecom_common.kafka import EventProducer

            producer = EventProducer(settings.kafka_bootstrap_servers, settings.service_name)
            await producer.start()
            app.state.producer = producer
        except Exception:
            log.exception("kafka_producer_unavailable")
            producer = None

    app.state.auth_service = AuthService(settings, sessions, producer)
    log.info("auth_service_started")
    yield
    if producer is not None:
        await producer.stop()
    await app.state.redis.aclose()
    await app.state.engine.dispose()


async def _check_db() -> bool:
    from sqlalchemy import text

    async with app.state.engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    return True


async def _check_redis() -> bool:
    return bool(await app.state.redis.ping())


app = create_app(
    settings=settings,
    title="E-Commerce Auth Service",
    description="Authentication, Google SSO, JWT access/refresh with rotation, Redis sessions, RBAC",
    routers=[router, internal_router],
    readiness_checks={"database": _check_db, "redis": _check_redis},
    lifespan=lifespan,
    cors_origins=settings.cors_origins,
    tags_metadata=TAGS_METADATA,
)
