"""Refresh rotation, reuse detection, and logout behavior with fakeredis + in-memory SQLite."""

import pytest
import pytest_asyncio
from auth_service.config import Settings
from auth_service.models import User
from auth_service.schemas import UserSignup
from auth_service.service import AuthService
from auth_service.sessions import SessionStore
from ecom_common.auth import decode_token
from ecom_common.db import Base
from ecom_common.errors import UnauthorizedError
from fakeredis import FakeAsyncRedis
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


@pytest.fixture
def settings() -> Settings:
    return Settings(jwt_secret="unit-test-secret", database_url="sqlite+aiosqlite://", _env_file=None)


@pytest_asyncio.fixture
async def db(settings):
    engine = create_async_engine(settings.database_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        yield session
    await engine.dispose()


@pytest_asyncio.fixture
async def svc(settings):
    redis = FakeAsyncRedis(decode_responses=True)
    sessions = SessionStore(redis, refresh_ttl_seconds=3600)
    service = AuthService(settings, sessions)
    service._test_redis = redis  # exposed for assertions
    yield service


async def _register(svc, db) -> User:
    return await svc.register(UserSignup(username="alice", email="alice@example.com", password="Str0ng!pass"), db)


async def test_signin_issues_valid_pair(svc, db, settings):
    user = await _register(svc, db)
    pair = await svc.issue_token_pair(user)
    access = decode_token(
        pair.access_token, secret=settings.jwt_secret, algorithm="HS256", issuer=settings.jwt_issuer, audience=settings.jwt_audience
    )
    assert access.sub == str(user.id)
    assert access.sid is not None


async def test_refresh_rotates_and_old_token_is_rejected(svc, db):
    user = await _register(svc, db)
    pair1 = await svc.issue_token_pair(user)
    pair2 = await svc.refresh_tokens(pair1.refresh_token, db)
    assert pair2.refresh_token != pair1.refresh_token

    # Reusing the rotated-away token is treated as theft: whole session dies.
    with pytest.raises(UnauthorizedError, match="reuse"):
        await svc.refresh_tokens(pair1.refresh_token, db)

    # ... including the *new* token, because the session was destroyed.
    with pytest.raises(UnauthorizedError):
        await svc.refresh_tokens(pair2.refresh_token, db)


async def test_logout_denylists_access_and_kills_refresh(svc, db, settings):
    user = await _register(svc, db)
    pair = await svc.issue_token_pair(user)
    access = decode_token(
        pair.access_token, secret=settings.jwt_secret, algorithm="HS256", issuer=settings.jwt_issuer, audience=settings.jwt_audience
    )
    await svc.logout(access)

    assert await svc._test_redis.exists(f"denylist:jti:{access.jti}")
    with pytest.raises(UnauthorizedError):
        await svc.refresh_tokens(pair.refresh_token, db)


async def test_logout_all_revokes_every_session(svc, db):
    user = await _register(svc, db)
    pairs = [await svc.issue_token_pair(user) for _ in range(3)]
    from ecom_common.auth import decode_token as dt

    access = dt(
        pairs[0].access_token,
        secret=svc.settings.jwt_secret,
        algorithm="HS256",
        issuer=svc.settings.jwt_issuer,
        audience=svc.settings.jwt_audience,
    )
    revoked = await svc.logout_all(access)
    assert revoked == 3
    for pair in pairs:
        with pytest.raises(UnauthorizedError):
            await svc.refresh_tokens(pair.refresh_token, db)


async def test_duplicate_username_conflict(svc, db):
    await _register(svc, db)
    from ecom_common.errors import ConflictError

    with pytest.raises(ConflictError):
        await svc.register(UserSignup(username="alice", email="other@example.com", password="Str0ng!pass"), db)
