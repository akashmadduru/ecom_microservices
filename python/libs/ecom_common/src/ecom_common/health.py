from collections.abc import Awaitable, Callable

from fastapi import APIRouter, FastAPI
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator

ReadinessCheck = Callable[[], Awaitable[bool]]


def build_ops_router(readiness_checks: dict[str, ReadinessCheck] | None = None) -> APIRouter:
    """`/healthz` liveness (always OK if the process serves) and `/readyz`
    running the supplied dependency pings (db/redis/kafka)."""
    router = APIRouter(tags=["ops"])
    checks = readiness_checks or {}

    @router.get("/healthz", include_in_schema=False)
    async def healthz():
        return {"status": "ok"}

    @router.get("/readyz", include_in_schema=False)
    async def readyz():
        results: dict[str, str] = {}
        ready = True
        for name, check in checks.items():
            try:
                ok = await check()
            except Exception:
                ok = False
            results[name] = "ok" if ok else "fail"
            ready = ready and ok
        return JSONResponse(status_code=200 if ready else 503, content={"status": "ready" if ready else "not_ready", "checks": results})

    return router


def instrument_metrics(app: FastAPI) -> None:
    """Expose Prometheus metrics at /metrics with default HTTP RED metrics."""
    Instrumentator(excluded_handlers=["/metrics", "/healthz", "/readyz"]).instrument(app).expose(app, include_in_schema=False)
