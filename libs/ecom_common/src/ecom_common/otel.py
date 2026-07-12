import structlog
from fastapi import FastAPI

from ecom_common.logging import get_logger
from ecom_common.settings import BaseServiceSettings

log = get_logger("otel")


def setup_otel(app: FastAPI, settings: BaseServiceSettings, *, db_engine=None) -> None:
    """Wire OpenTelemetry tracing: FastAPI, httpx, SQLAlchemy, redis -> OTLP collector.

    No-op unless `otel_enabled` is set, so services run fine without a collector.
    """
    if not settings.otel_enabled or not settings.otel_exporter_endpoint:
        return

    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
    from opentelemetry.instrumentation.redis import RedisInstrumentor
    from opentelemetry.sdk.resources import SERVICE_NAME, Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    provider = TracerProvider(resource=Resource.create({SERVICE_NAME: settings.service_name}))
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=settings.otel_exporter_endpoint, insecure=True)))
    trace.set_tracer_provider(provider)

    FastAPIInstrumentor.instrument_app(app, tracer_provider=provider, excluded_urls="healthz,readyz,metrics")
    HTTPXClientInstrumentor().instrument(tracer_provider=provider)
    RedisInstrumentor().instrument(tracer_provider=provider)
    if db_engine is not None:
        from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor

        SQLAlchemyInstrumentor().instrument(engine=db_engine.sync_engine, tracer_provider=provider)

    # Inject trace_id into every structlog line for log <-> trace correlation.
    def add_trace_id(logger, method_name, event_dict):
        span = trace.get_current_span()
        ctx = span.get_span_context()
        if ctx.is_valid:
            event_dict["trace_id"] = format(ctx.trace_id, "032x")
        return event_dict

    current = structlog.get_config()
    structlog.configure(processors=[add_trace_id] + list(current["processors"]))
    log.info("otel_enabled", endpoint=settings.otel_exporter_endpoint)
