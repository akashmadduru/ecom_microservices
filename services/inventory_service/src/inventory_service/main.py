import asyncio
from contextlib import asynccontextmanager

from ecom_common.bootstrap import create_app
from ecom_common.db import build_engine, build_session_factory
from ecom_common.logging import get_logger
from ecom_common.redis import create_redis
from fastapi import FastAPI

from inventory_service.api.routes import admin_router, internal_router, router
from inventory_service.config import get_settings

log = get_logger("inventory.main")

settings = get_settings()

TAGS_METADATA = [
    {"name": "inventory", "description": "Stock ledger CRUD, reservations, restocking, adjustments, reports."},
    {"name": "admin", "description": "Admin-only bulk operations and the inventory health report."},
    {"name": "internal", "description": "Service-to-service only; not routable through the gateway."},
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.engine = build_engine(settings.database_url)
    app.state.session_factory = build_session_factory(app.state.engine)
    app.state.redis = create_redis(settings.redis_url)

    app.state.producer = None
    app.state.consumer = None
    app.state.consumer_start_task = None

    if settings.kafka_bootstrap_servers:
        try:
            from ecom_common.kafka import EventProducer

            app.state.producer = EventProducer(settings.kafka_bootstrap_servers, settings.service_name)
            await app.state.producer.start()
        except Exception:
            log.exception("kafka_producer_unavailable")
            app.state.producer = None

        if app.state.producer is not None:
            try:
                from inventory_service.consumers import build_consumer

                app.state.consumer = build_consumer(
                    bootstrap_servers=settings.kafka_bootstrap_servers,
                    redis=app.state.redis,
                    producer=app.state.producer,
                    session_factory=app.state.session_factory,
                )
                # EventConsumer.start() blocks (retry loop) until the broker is
                # reachable — background it so a slow/absent Kafka never blocks
                # service boot or /readyz, matching the producer's own tolerance.
                app.state.consumer_start_task = asyncio.create_task(app.state.consumer.start())
            except Exception:
                log.exception("kafka_consumer_unavailable")
                app.state.consumer = None

    log.info("inventory_service_started")
    yield

    if app.state.consumer is not None:
        if app.state.consumer_start_task and not app.state.consumer_start_task.done():
            app.state.consumer_start_task.cancel()
        else:
            try:
                await app.state.consumer.stop()
            except Exception:
                log.exception("kafka_consumer_stop_failed")
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
    title="E-Commerce Inventory Service",
    description="Product inventory & stock management: reservations, stock ledger, low/out-of-stock reporting, event-driven integration",
    routers=[router, admin_router, internal_router],
    readiness_checks={"database": _check_db, "redis": _check_redis},
    lifespan=lifespan,
    cors_origins=settings.cors_origins.split(","),
    tags_metadata=TAGS_METADATA,
)
