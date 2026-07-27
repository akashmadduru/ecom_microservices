from collections.abc import Sequence

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ecom_common.errors import register_exception_handlers
from ecom_common.health import ReadinessCheck, build_ops_router, instrument_metrics
from ecom_common.logging import CorrelationIdMiddleware, configure_logging
from ecom_common.settings import BaseServiceSettings


def create_app(
    *,
    settings: BaseServiceSettings,
    title: str,
    description: str = "",
    routers: Sequence[APIRouter] = (),
    readiness_checks: dict[str, ReadinessCheck] | None = None,
    lifespan=None,
    cors_origins: Sequence[str] = (),
    tags_metadata: list[dict] | None = None,
    contact: dict | None = None,
) -> FastAPI:
    """Standard service assembly: logging, correlation IDs, error handlers,
    health/readiness endpoints, Prometheus metrics, OpenAPI metadata.

    `tags_metadata`/`contact` are optional Swagger/OpenAPI enrichment — omitting
    them keeps FastAPI's own defaults, so existing callers need no changes."""
    configure_logging(settings.service_name, settings.log_level, json_logs=settings.is_prod)

    app = FastAPI(
        title=title,
        description=description,
        version="1.0.0",
        lifespan=lifespan,
        openapi_tags=tags_metadata,
        contact=contact,
        swagger_ui_parameters={"persistAuthorization": True},
    )

    app.add_middleware(CorrelationIdMiddleware)
    if cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    register_exception_handlers(app)
    app.include_router(build_ops_router(readiness_checks))
    for router in routers:
        app.include_router(router)
    instrument_metrics(app)
    return app
