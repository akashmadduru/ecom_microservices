from collections.abc import AsyncIterator, Callable
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from starlette.requests import Request

class Base(DeclarativeBase):
    pass

class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


def build_engine(database_url: str, *, echo: bool = False, pool_size: int = 10, max_overflow: int = 20) -> AsyncEngine:
    return create_async_engine(database_url, echo=echo, pool_size=pool_size, max_overflow=max_overflow, pool_pre_ping=True)


def build_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)


def session_dependency(session_factory: async_sessionmaker[AsyncSession]) -> Callable[[], AsyncIterator[AsyncSession]]:
    """Build a FastAPI dependency yielding a session per request."""

    async def get_db() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    return get_db


async def get_db(request: Request) -> AsyncIterator[AsyncSession]:
    """Standard request-scoped session dependency; expects the lifespan to have
    placed an async_sessionmaker on `app.state.session_factory`."""
    async with request.app.state.session_factory() as session:
        yield session
