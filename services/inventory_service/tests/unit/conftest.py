import os
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio

# inventory_service.main builds `Settings()` at import time (mirroring
# product_service/auth_service); guarantee jwt_secret is present regardless
# of the pytest CWD/.env resolution so importing it in tests never depends on
# ambient environment state.
os.environ.setdefault("JWT_SECRET", "unit-test-secret-not-for-prod")
from ecom_common.db import Base
from ecom_common.errors import register_exception_handlers
from fakeredis import FakeAsyncRedis
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from inventory_service.api.routes import admin_router, internal_router, router
from inventory_service.config import Settings
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest.fixture
def settings() -> Settings:
    return Settings(jwt_secret="unit-test-secret", database_url="sqlite+aiosqlite://", _env_file=None)


@pytest_asyncio.fixture
async def engine():
    # StaticPool keeps the single in-memory sqlite connection alive across the
    # test (a fresh connection per checkout would otherwise see an empty DB).
    eng = create_async_engine("sqlite+aiosqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def session_factory(engine):
    return async_sessionmaker(engine, expire_on_commit=False)


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
