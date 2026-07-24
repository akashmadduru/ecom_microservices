"""Reverse proxy core: policy enforcement, header shaping, breaker-guarded forwarding."""

import asyncio

import httpx
from ecom_common.auth import Role, TokenPayload
from ecom_common.errors import UpstreamError
from ecom_common.http import CircuitBreaker
from ecom_common.logging import get_logger

from api_gateway.route_table import Route

log = get_logger("gateway.proxy")

# Hop-by-hop headers must not be forwarded either way.
HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "host",
    "content-length",
}

GET_RETRIES = 2


class UpstreamProxy:
    def __init__(
        self,
        *,
        connect_timeout: float = 2.0,
        read_timeout: float = 15.0,
        write_timeout: float = 10.0,
        pool_timeout: float = 5.0,
        circuit_breaker_failure_threshold: int = 5,
        circuit_breaker_reset_timeout: float = 30.0,
    ):
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(connect=connect_timeout, read=read_timeout, write=write_timeout, pool=pool_timeout)
        )
        self._breakers: dict[str, CircuitBreaker] = {}
        self._circuit_breaker_failure_threshold = circuit_breaker_failure_threshold
        self._circuit_breaker_reset_timeout = circuit_breaker_reset_timeout

    def breaker(self, upstream_name: str) -> CircuitBreaker:
        if upstream_name not in self._breakers:
            self._breakers[upstream_name] = CircuitBreaker(
                upstream_name,
                failure_threshold=self._circuit_breaker_failure_threshold,
                reset_timeout=self._circuit_breaker_reset_timeout,
            )
        return self._breakers[upstream_name]

    async def aclose(self) -> None:
        await self._client.aclose()

    async def forward(
        self,
        route: Route,
        *,
        method: str,
        path: str,
        query: str,
        headers: dict[str, str],
        body: bytes,
        client_ip: str,
        correlation_id: str,
        user: TokenPayload | None,
    ) -> httpx.Response:
        breaker = self.breaker(route.upstream_name)
        if not breaker.allow():
            raise UpstreamError(f"{route.upstream_name} temporarily unavailable (circuit open)")

        out_headers = {k: v for k, v in headers.items() if k.lower() not in HOP_BY_HOP}
        out_headers["X-Correlation-ID"] = correlation_id
        out_headers["X-Forwarded-For"] = client_ip
        # Identity headers are gateway-owned: strip inbound spoofing attempts, then inject.
        for spoofable in ("x-user-id", "x-user-role", "x-user-name"):
            out_headers.pop(spoofable, None)
        if user is not None:
            out_headers["X-User-Id"] = user.sub
            out_headers["X-User-Role"] = user.role.value if isinstance(user.role, Role) else str(user.role or "")
            if user.username:
                out_headers["X-User-Name"] = user.username

        url = f"{route.upstream}{path}"
        if query:
            url = f"{url}?{query}"

        attempts = 1 + (GET_RETRIES if method.upper() == "GET" else 0)
        last_exc: Exception | None = None
        for attempt in range(1, attempts + 1):
            try:
                response = await self._client.request(method, url, headers=out_headers, content=body)
            except httpx.HTTPError as exc:
                last_exc = exc
                breaker.record_failure()
                log.warning("upstream_request_failed", upstream=route.upstream_name, attempt=attempt, error=str(exc))
                if attempt < attempts:
                    await asyncio.sleep(0.2 * attempt)
                continue
            if response.status_code >= 500:
                breaker.record_failure()
            else:
                breaker.record_success()
            return response

        raise UpstreamError(f"{route.upstream_name} unreachable") from last_exc
