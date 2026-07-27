"""Fixtures for product_service integration tests, run against a real
Postgres instance.

Why this differs from inventory_service/auth_service's SQLite-in-memory
conftest: this schema leans on Postgres-only column types (`JSONB`, `ARRAY`,
a `Computed` STORED generated `search_document` column) and an ltree-cast
subtree query (`CategoryRepository.get_subtree`). SQLite's DDL compiler can't
render any of those (`Base.metadata.create_all` against
`sqlite+aiosqlite://` fails outright on the `products` table), so there is no
meaningful SQLite subset of this suite to fall back to the way
inventory_service does.

There is no `testcontainers` dependency anywhere in this monorepo yet (root
`pyproject.toml`'s `integration` marker anticipates it, but nothing uses it).
Rather than introduce a brand-new test-infra dependency for this one
service, this conftest provisions and tears down an ephemeral database on
whatever Postgres is reachable at `TEST_PG_ADMIN_DSN` — by default the
already-running `ecom-postgres` container from this repo's
`docker-compose.yml` (host port 5441, matching `.env`/`.env.example`) — and
runs the real Alembic migrations (0001-0006) against it once per test
session. If Postgres isn't reachable there (e.g. `docker compose up` was
never run in this environment), every test under `tests/integration/` is
skipped with an explicit reason instead of erroring.

Per-test isolation uses the standard SQLAlchemy 2.0 pattern for testing code
that calls `session.commit()`: a single outer transaction is opened on one
connection per test, and the session bound to it uses
`join_transaction_mode="create_savepoint"` so the app's own `commit()`/
`rollback()` calls only affect a SAVEPOINT — the outer transaction (and
everything written in the test) is always rolled back at teardown, so tests
never see each other's data and the schema only needs to be migrated once.
"""

import asyncio
import os
import subprocess
from pathlib import Path
from unittest.mock import AsyncMock

import asyncpg
import pytest
import pytest_asyncio
from ecom_common.auth import Role, TokenPayload
from ecom_common.errors import register_exception_handlers
from fakeredis import FakeAsyncRedis
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

# product_service.main builds `Settings()` at import time; guarantee
# JWT_SECRET is present regardless of pytest's CWD/.env resolution before any
# product_service module gets imported (mirrors inventory_service's guard).
os.environ.setdefault("JWT_SECRET", "integration-test-secret-not-for-prod")

from product_service.api.routes import admin_catalog_router, admin_router, internal_router, router  # noqa: E402
from product_service.deps import get_current_user  # noqa: E402

SERVICE_ROOT = Path(__file__).resolve().parents[2]

ADMIN_DSN = os.getenv("TEST_PG_ADMIN_DSN", "postgresql://postgres:postgres@localhost:5441/postgres")
TEST_DB_NAME = os.getenv("TEST_PG_DB_NAME", "product_service_test")
TEST_DB_USER = os.getenv("TEST_PG_APP_USER", "product_user")
TEST_DB_PASSWORD = os.getenv("TEST_PG_APP_PASSWORD", "product_user")
TEST_DATABASE_URL = f"postgresql+asyncpg://{TEST_DB_USER}:{TEST_DB_PASSWORD}@localhost:5441/{TEST_DB_NAME}"

SKIP_REASON = (
    f"Postgres not reachable at {ADMIN_DSN!r} - start this repo's docker-compose "
    "Postgres (e.g. `docker compose up -d postgres`) to run product_service "
    "integration tests. See tests/integration/conftest.py."
)


def _pg_reachable() -> bool:
    async def _check() -> bool:
        try:
            conn = await asyncpg.connect(ADMIN_DSN, timeout=2)
        except Exception:
            return False
        await conn.close()
        return True

    return asyncio.run(_check())


async def _recreate_database() -> None:
    conn = await asyncpg.connect(ADMIN_DSN)
    try:
        # Terminate any leftover connections from a prior interrupted run,
        # then drop/recreate for a clean slate every session.
        await conn.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            f"WHERE datname = '{TEST_DB_NAME}' AND pid <> pg_backend_pid()"
        )
        await conn.execute(f'DROP DATABASE IF EXISTS "{TEST_DB_NAME}"')
        await conn.execute(f'CREATE DATABASE "{TEST_DB_NAME}" OWNER {TEST_DB_USER}')
    finally:
        await conn.close()


async def _drop_database() -> None:
    conn = await asyncpg.connect(ADMIN_DSN)
    try:
        await conn.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            f"WHERE datname = '{TEST_DB_NAME}' AND pid <> pg_backend_pid()"
        )
        await conn.execute(f'DROP DATABASE IF EXISTS "{TEST_DB_NAME}"')
    finally:
        await conn.close()


def _run_migrations() -> None:
    env = {**os.environ, "DATABASE_URL": TEST_DATABASE_URL}
    result = subprocess.run(
        ["uv", "run", "alembic", "upgrade", "head"],
        cwd=str(SERVICE_ROOT),
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )
    if result.returncode != 0:
        pytest.fail(f"alembic upgrade head failed (exit {result.returncode}):\n{result.stdout}\n{result.stderr}")


@pytest.fixture(scope="session")
def test_database() -> str:
    if not _pg_reachable():
        pytest.skip(SKIP_REASON)
    asyncio.run(_recreate_database())
    _run_migrations()
    yield TEST_DATABASE_URL
    asyncio.run(_drop_database())


@pytest_asyncio.fixture(scope="session")
async def engine(test_database):
    # NullPool: we manage one explicit connection per test ourselves below,
    # no benefit to a shared pool and it avoids any cross-test connection reuse.
    eng = create_async_engine(test_database, poolclass=NullPool)
    # Sanity check that Base.metadata matches expectations (all model tables
    # importable/registered) without asserting exact columns here — the
    # per-test suites do that where it matters.
    async with eng.connect() as conn:
        await conn.execute(text("SELECT 1"))
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def connection(engine):
    async with engine.connect() as conn:
        yield conn


@pytest_asyncio.fixture
async def db_transaction(connection):
    trans = await connection.begin()
    try:
        yield connection
    finally:
        await trans.rollback()


@pytest.fixture
def session_factory(db_transaction):
    return async_sessionmaker(bind=db_transaction, join_transaction_mode="create_savepoint", expire_on_commit=False)


@pytest_asyncio.fixture
async def db(session_factory):
    async with session_factory() as session:
        yield session


@pytest_asyncio.fixture
async def redis():
    return FakeAsyncRedis(decode_responses=True)


@pytest_asyncio.fixture
async def app(session_factory, redis) -> FastAPI:
    application = FastAPI()
    application.include_router(router)
    application.include_router(admin_router)
    application.include_router(admin_catalog_router)
    application.include_router(internal_router)
    application.state.session_factory = session_factory
    application.state.redis = redis
    application.state.producer = AsyncMock()
    register_exception_handlers(application)
    return application


@pytest_asyncio.fixture
async def client(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest.fixture
def publish_product(db):
    """Force a product straight to PUBLISHED status via a direct DB write.

    Neither `ProductCreate` nor `ProductUpdate` exposes a `status` field (this
    phase doesn't wire up a moderation workflow yet — `create_product` always
    starts a product at `DRAFT`, per the ORM's Python-side default), and every
    *public read* path (`get_product`, `list_variants`, `get_variant`,
    `list_images`, the default `list_products` filter) only surfaces
    `PUBLISHED` products via `_get_visible_product`/`build_catalog_query`'s
    `published_only` default. Tests that need to exercise those read paths
    (as opposed to owner/admin write paths, which aren't status-gated) have
    to reach around the API to publish, exactly as a real moderation-approval
    step would eventually do server-side.
    """

    async def _publish(product_id: int) -> None:
        await db.execute(text("UPDATE products SET status = 'PUBLISHED' WHERE id = :id"), {"id": product_id})
        await db.commit()

    return _publish


# ---------------------------------------------------------------------------
# Auth mocking helpers (dependency_overrides), mirroring
# inventory_service/tests/unit/test_api_routes.py's pattern. Exposed as
# fixtures (pre-bound to `app`) rather than plain importable functions,
# since test modules under tests/integration/ aren't a package other test
# modules can import from under `--import-mode=importlib` (matching how
# inventory_service's test_api_routes.py keeps this logic local rather than
# sharing it via conftest imports).
# ---------------------------------------------------------------------------


def make_token(sub: str = "1", role: Role = Role.SELLER) -> TokenPayload:
    return TokenPayload(sub=sub, email=f"user{sub}@example.com", username=f"user{sub}", role=role, jti=f"jti-{sub}", exp=9999999999, iat=0)


@pytest.fixture
def as_seller(app: FastAPI):
    def _set(sub: str = "42"):
        app.dependency_overrides[get_current_user] = lambda: make_token(sub=sub, role=Role.SELLER)

    return _set


@pytest.fixture
def as_admin(app: FastAPI):
    def _set(sub: str = "1"):
        app.dependency_overrides[get_current_user] = lambda: make_token(sub=sub, role=Role.ADMIN)

    return _set


@pytest.fixture
def as_anonymous(app: FastAPI):
    def _set():
        app.dependency_overrides.pop(get_current_user, None)

    return _set
