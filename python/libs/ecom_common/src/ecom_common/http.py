import time

import httpx

from ecom_common.errors import UpstreamError
from ecom_common.logging import get_logger

log = get_logger("http")


class CircuitBreaker:
    """Closed -> open after `failure_threshold` consecutive failures;
    half-open after `reset_timeout` seconds; one probe decides."""

    def __init__(self, name: str, failure_threshold: int = 5, reset_timeout: float = 30.0):
        self.name = name
        self.failure_threshold = failure_threshold
        self.reset_timeout = reset_timeout
        self._failures = 0
        self._opened_at: float | None = None

    @property
    def state(self) -> str:
        if self._opened_at is None:
            return "closed"
        if time.monotonic() - self._opened_at >= self.reset_timeout:
            return "half-open"
        return "open"

    def allow(self) -> bool:
        return self.state != "open"

    def record_success(self) -> None:
        self._failures = 0
        self._opened_at = None

    def record_failure(self) -> None:
        self._failures += 1
        if self._failures >= self.failure_threshold and self._opened_at is None:
            self._opened_at = time.monotonic()
            log.warning("circuit_opened", upstream=self.name, failures=self._failures)


def build_client(base_url: str, *, connect_timeout: float = 2.0, read_timeout: float = 15.0, retries: int = 2) -> httpx.AsyncClient:
    """AsyncClient with connection retries for idempotent requests and sane timeouts."""
    transport = httpx.AsyncHTTPTransport(retries=retries)
    timeout = httpx.Timeout(connect=connect_timeout, read=read_timeout, write=10.0, pool=5.0)
    return httpx.AsyncClient(base_url=base_url, transport=transport, timeout=timeout)


class ServiceClient:
    """Typed helper for service-to-service calls with breaker + error mapping."""

    def __init__(self, name: str, base_url: str, breaker: CircuitBreaker | None = None):
        self.name = name
        self.client = build_client(base_url)
        self.breaker = breaker or CircuitBreaker(name)

    async def request(self, method: str, path: str, **kwargs) -> httpx.Response:
        if not self.breaker.allow():
            raise UpstreamError(f"{self.name} circuit open")
        try:
            response = await self.client.request(method, path, **kwargs)
        except httpx.HTTPError as exc:
            self.breaker.record_failure()
            raise UpstreamError(f"{self.name} unreachable: {exc}") from exc
        if response.status_code >= 500:
            self.breaker.record_failure()
        else:
            self.breaker.record_success()
        return response

    async def aclose(self) -> None:
        await self.client.aclose()
