"""Batch-insert helpers shared by the CSV seeder (`seeder.py`) and the
full-catalog seeder (`catalog_seeder.py`): chunking, `ON CONFLICT DO NOTHING`
batch inserts with a row-by-row fallback, gzip'd JSON reading, and serial
sequence resync after bulk inserts that supplied explicit ids.
"""

import asyncio
import gzip
import json
import re
from collections.abc import Iterator, Sequence
from pathlib import Path

from ecom_common.logging import get_logger
from sqlalchemy import Table, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

log = get_logger("product.seed_utils")


def chunk(items: list[dict], size: int) -> Iterator[list[dict]]:
    for start in range(0, len(items), size):
        yield items[start : start + size]


def _read_gzip_json(path: Path) -> list[dict] | None:
    if not path.is_file():
        return None
    with gzip.open(path, "rt", encoding="utf-8") as file:
        return json.load(file)


async def read_gzip_json(path: Path) -> list[dict] | None:
    return await asyncio.to_thread(_read_gzip_json, path)  # blocking file IO off the event loop


async def insert_batch(
    db: AsyncSession, table: Table, batch: list[dict], *, conflict_index_elements: Sequence[str], commit: bool = True
) -> int:
    """Insert one batch, skipping rows that collide on `conflict_index_elements`.
    Returns the number of rows actually inserted (Postgres omits conflicted
    rows from the command tag, so `rowcount` already excludes them).

    `commit=False` lets a caller batch multiple `insert_batch` calls under one
    outer transaction (e.g. one commit per table instead of one per batch);
    the caller is then responsible for committing (or rolling back) itself.
    """
    stmt = pg_insert(table).values(batch).on_conflict_do_nothing(index_elements=list(conflict_index_elements))
    result = await db.execute(stmt)
    if commit:
        await db.commit()
    return result.rowcount or 0


def _row_label(record: dict, row_label_field: str | Sequence[str] | None) -> str | None:
    """Build a diagnostic label for a failed row. A plain column name (e.g.
    `"id"`/`"title"`) is looked up directly; a sequence of column names (used
    for tables with no single `id`, i.e. the composite-PK association tables)
    is joined into a single `"col1val/col2val"` label instead."""
    if row_label_field is None:
        return None
    if isinstance(row_label_field, str):
        return record.get(row_label_field)
    return "/".join(str(record.get(col)) for col in row_label_field)


async def insert_batch_with_fallback(
    db: AsyncSession,
    table: Table,
    batch: list[dict],
    *,
    conflict_index_elements: Sequence[str],
    row_label_field: str | Sequence[str] | None = None,
    commit: bool = True,
) -> dict:
    """Try the batch as one statement; if it fails for any reason, roll back
    and retry row-by-row so one bad record doesn't sink its whole batch.

    The row-by-row fallback always commits (or rolls back) each row
    individually regardless of `commit`, so a bad record among good ones is
    isolated at the finest possible granularity on the exceptional path —
    `commit=False` only affects the happy-path whole-batch insert.
    """
    try:
        inserted = await insert_batch(db, table, batch, conflict_index_elements=conflict_index_elements, commit=commit)
        return {"inserted": inserted, "skipped": len(batch) - inserted, "failed": 0}
    except Exception as exc:
        await db.rollback()
        log.warning("seed_batch_failed_retrying_rows", table=table.name, batch_size=len(batch), error=str(exc))

        inserted = skipped = failed = 0
        for record in batch:
            try:
                row_inserted = await insert_batch(db, table, [record], conflict_index_elements=conflict_index_elements)
                inserted += row_inserted
                skipped += 1 - row_inserted
            except Exception as row_exc:
                await db.rollback()
                failed += 1
                label = _row_label(record, row_label_field)
                log.error("seed_row_failed", table=table.name, label=label, error=str(row_exc))
        return {"inserted": inserted, "skipped": skipped, "failed": failed}


_IDENTIFIER_RE = re.compile(r"[a-zA-Z_][a-zA-Z0-9_]*")


async def resync_sequence(db: AsyncSession, table_name: str, id_column: str = "id", *, commit: bool = True) -> None:
    """Reset `table_name`'s serial sequence to MAX(id_column) after a bulk
    insert that supplied explicit ids — otherwise the next ORM-side insert
    (which relies on `nextval`) collides with an id already used by the seed.

    Runs in the same transaction as the inserts that preceded it, so
    `MAX(id_column)` sees those rows even when `commit=False` (a transaction
    always sees its own uncommitted writes) — the sequence is resynced
    correctly whether or not this call itself commits.

    `table_name`/`id_column` are interpolated directly into the SQL text
    rather than bound as params — Postgres doesn't allow identifiers as bind
    params. Safe only because every call site passes a hardcoded literal from
    `catalog_seeder.py`'s own loader config, never external input; the assert
    below is a cheap structural guard so a future misuse fails loudly instead
    of silently becoming an injection vector.
    """
    assert _IDENTIFIER_RE.fullmatch(table_name), f"unsafe table_name for raw SQL: {table_name!r}"
    assert _IDENTIFIER_RE.fullmatch(id_column), f"unsafe id_column for raw SQL: {id_column!r}"
    await db.execute(
        text(
            f"SELECT setval(pg_get_serial_sequence('{table_name}', '{id_column}'), "
            f"COALESCE((SELECT MAX({id_column}) FROM {table_name}), 1))"
        )
    )
    if commit:
        await db.commit()
