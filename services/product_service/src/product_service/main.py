from contextlib import asynccontextmanager

from ecom_common.bootstrap import create_app
from ecom_common.db import build_engine, build_session_factory
from ecom_common.logging import get_logger
from ecom_common.redis import create_redis
from fastapi import FastAPI

from product_service.api.routes import admin_router, internal_router, router
from product_service.config import get_settings

log = get_logger("product.main")

settings = get_settings()

TAGS_METADATA = [
    {"name": "products", "description": "Catalog CRUD, filtering, sorting, pagination, catalog events."},
    {"name": "admin", "description": "Admin-only catalog operations (seed)."},
    {"name": "internal", "description": "Service-to-service only; not routable through the gateway."},
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.engine = build_engine(settings.database_url)
    app.state.session_factory = build_session_factory(app.state.engine)
    app.state.redis = create_redis(settings.redis_url)

    app.state.producer = None
    if settings.kafka_bootstrap_servers:
        try:
            from ecom_common.kafka import EventProducer

            app.state.producer = EventProducer(settings.kafka_bootstrap_servers, settings.service_name)
            await app.state.producer.start()
        except Exception:
            log.exception("kafka_producer_unavailable")
            app.state.producer = None

    log.info("product_service_started")
    yield
    if app.state.producer is not None:
        await app.state.producer.stop()
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
    title="E-Commerce Product Service",
    description="Product catalog: filtering, sorting, pagination, catalog events",
    routers=[router, admin_router, internal_router],
    readiness_checks={"database": _check_db, "redis": _check_redis},
    lifespan=lifespan,
    cors_origins=settings.cors_origins.split(","),
    tags_metadata=TAGS_METADATA,
)
