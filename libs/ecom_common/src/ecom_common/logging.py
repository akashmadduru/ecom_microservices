import logging
import sys
import uuid

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

CORRELATION_HEADER = "X-Correlation-ID"
REQUEST_ID_HEADER = "X-Request-ID"

# Log-event kwargs whose values must never reach stdout, even if a future
# call site accidentally passes one through (e.g. `log.info(..., token=...)`).
_REDACTED_KEYS = {
    "password",
    "secret",
    "jwt_secret",
    "client_secret",
    "access_token",
    "refresh_token",
    "authorization",
    "api_key",
}
_REDACTED = "***REDACTED***"


def _redact_sensitive(_logger, _method_name, event_dict):
    for key in event_dict:
        if key.lower() in _REDACTED_KEYS:
            event_dict[key] = _REDACTED
    return event_dict


def configure_logging(service_name: str, log_level: str = "INFO", json_logs: bool = True) -> None:
    """Configure structlog for the whole process.

    Every log line carries: timestamp, service, level, logger, and any bound
    contextvars (correlation_id, request_id, user_id, trace_id). Known
    secret-shaped keys are redacted before rendering (defense in depth — no
    call site intentionally logs a secret today, but this stops it from
    silently starting to).
    """
    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=getattr(logging, log_level.upper(), logging.INFO))

    shared_processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        _redact_sensitive,
    ]
    renderer = structlog.processors.JSONRenderer() if json_logs else structlog.dev.ConsoleRenderer()

    structlog.configure(
        processors=shared_processors + [renderer],
        wrapper_class=structlog.make_filtering_bound_logger(getattr(logging, log_level.upper(), logging.INFO)),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )
    structlog.contextvars.bind_contextvars(service=service_name)


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name) if name else structlog.get_logger()


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """Reads (or mints) correlation/request IDs and binds them to the log context.

    Also binds `user_id` when the gateway injected an X-User-Id header.
    The correlation id is echoed back on the response for client-side tracing.
    """

    async def dispatch(self, request: Request, call_next):
        correlation_id = request.headers.get(CORRELATION_HEADER) or str(uuid.uuid4())
        request_id = request.headers.get(REQUEST_ID_HEADER) or str(uuid.uuid4())
        user_id = request.headers.get("X-User-Id")

        structlog.contextvars.clear_contextvars()
        bind = {"correlation_id": correlation_id, "request_id": request_id}
        if user_id:
            bind["user_id"] = user_id
        structlog.contextvars.bind_contextvars(**bind)
        request.state.correlation_id = correlation_id

        response = await call_next(request)
        response.headers[CORRELATION_HEADER] = correlation_id
        return response
