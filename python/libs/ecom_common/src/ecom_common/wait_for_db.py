"""Blocking, retrying database readiness check for container entrypoints.

Postgres's own healthcheck (`pg_isready`) only proves the server accepts
connections — it says nothing about whether *this* service's database/role
exists yet or whether the connection is momentarily reset while Postgres
finishes initializing. Every DB-backed service runs this, via
`python -m ecom_common.wait_for_db`, before `alembic upgrade head` so
migrations never race container startup.
"""

import asyncio
import os
import sys
import time

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from ecom_common.logging import configure_logging, get_logger

log = get_logger("wait_for_db")


async def wait_for_db(database_url: str, *, max_attempts: int, initial_delay: float = 1.0, max_delay: float = 10.0) -> None:
    engine = create_async_engine(database_url, pool_pre_ping=True)
    delay = initial_delay
    try:
        for attempt in range(1, max_attempts + 1):
            try:
                async with engine.connect() as conn:
                    await conn.execute(text("SELECT 1"))
                log.info("database_ready", attempt=attempt)
                return
            except Exception as exc:
                if attempt == max_attempts:
                    log.error("database_unreachable", attempt=attempt, max_attempts=max_attempts, error=str(exc))
                    raise
                log.warning(
                    "database_not_ready",
                    attempt=attempt,
                    max_attempts=max_attempts,
                    retry_in_seconds=delay,
                    error=str(exc),
                )
                await asyncio.sleep(delay)
                delay = min(delay * 2, max_delay)
    finally:
        await engine.dispose()


def main() -> None:
    service_name = os.environ.get("SERVICE_NAME", "ecom-service")
    configure_logging(service_name, os.environ.get("LOG_LEVEL", "INFO"))

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        log.error("database_url_missing")
        sys.exit(1)

    max_attempts = int(os.environ.get("DB_WAIT_MAX_ATTEMPTS", "30"))
    start = time.monotonic()
    try:
        asyncio.run(wait_for_db(database_url, max_attempts=max_attempts))
    except Exception:
        log.error("database_wait_failed", elapsed_seconds=round(time.monotonic() - start, 2))
        sys.exit(1)
    log.info("database_wait_succeeded", elapsed_seconds=round(time.monotonic() - start, 2))


if __name__ == "__main__":
    main()
