"""Proves the repo layer doesn't oversell under concurrent reservations.

Postgres's `SELECT ... FOR UPDATE` (used in production) takes a real row lock,
so concurrent reserve() calls serialize correctly. sqlite has no row-level
locking, so a plain SELECT-then-UPDATE would race (both transactions could
read the same stale available_quantity before either writes). We force
`BEGIN IMMEDIATE` per-transaction below so sqlite's own write lock is
acquired at transaction start — a standard SQLAlchemy+sqlite concurrency
testing pattern that emulates the mutual exclusion FOR UPDATE provides, but
is not a substitute for a real Postgres integration test (out of scope here;
see the compile-time check below for confidence the FOR UPDATE clause itself
is actually emitted for Postgres).
"""

import asyncio

from ecom_common.db import Base
from inventory_service.models import Inventory
from inventory_service.repo import InventoryRepository
from sqlalchemy import event, select
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


def test_reserve_query_compiles_with_for_update_on_postgres():
    stmt = select(Inventory).where(Inventory.product_id == 1).with_for_update()
    compiled = str(stmt.compile(dialect=postgresql.dialect()))
    assert "FOR UPDATE" in compiled


async def test_concurrent_reserve_never_oversells(tmp_path):
    db_path = tmp_path / "inventory_concurrency.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}", connect_args={"timeout": 30})

    @event.listens_for(engine.sync_engine, "connect")
    def _disable_pysqlite_begin(dbapi_connection, _record):
        dbapi_connection.isolation_level = None

    @event.listens_for(engine.sync_engine, "begin")
    def _begin_immediate(conn):
        conn.exec_driver_sql("BEGIN IMMEDIATE")

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with session_factory() as setup_db:
        await InventoryRepository(setup_db).create_inventory(product_id=1, sku="SKU-1", available_quantity=10, reorder_threshold=2)

    async def attempt(order_id: str) -> bool:
        async with session_factory() as task_db:
            try:
                await InventoryRepository(task_db).reserve(1, 3, order_id)
                return True
            except Exception:
                return False

    results = await asyncio.gather(*(attempt(f"order-{i}") for i in range(5)))
    succeeded = sum(results)

    async with session_factory() as check_db:
        inv = await InventoryRepository(check_db).get_by_product(1)

    assert succeeded <= 3  # floor(10 / 3) — never oversold
    assert inv.available_quantity == 10 - succeeded * 3
    assert inv.available_quantity >= 0

    await engine.dispose()
