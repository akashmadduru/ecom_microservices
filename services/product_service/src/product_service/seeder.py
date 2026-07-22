"""CSV catalog seeder, carried over from the original products_repo.init_products.

The CSV path comes from settings (absolute), because the old relative-path open
breaks inside containers and under the src layout.

Rows are inserted with SQLAlchemy Core (not ORM objects) in configurable
batches, using `INSERT ... ON CONFLICT DO NOTHING` keyed on a uniq_id derived
deterministically from each row's content. That makes re-seeding idempotent
at the row level (not just the coarse "table is non-empty" check below): the
same CSV row always maps to the same uniq_id, so a partial or repeated seed
skips rows it already inserted instead of duplicating them.
"""

import asyncio
import csv
import re
import time
import uuid
from collections.abc import Iterator
from decimal import Decimal, InvalidOperation
from pathlib import Path

from ecom_common.logging import get_logger
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from product_service.models import Product
from product_service.repo import ProductRepository

log = get_logger("product.seeder")

# Fixed, deterministic namespace for uniq_id generation — every row with the
# same (title, category, price) always hashes to the same uniq_id, across
# processes and re-runs.
_SEED_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_DNS, "ecom.product-service.seed")


def _to_decimal(value: str | None) -> Decimal:
    try:
        return Decimal(value) if value else Decimal("0")
    except InvalidOperation:
        return Decimal("0")


def _read_rows(csv_path: str) -> list[dict] | None:
    path = Path(csv_path)
    if not path.is_file():
        return None
    with path.open(encoding="utf-8") as file:
        return list(csv.DictReader(file))


def _deterministic_uniq_id(title: str, category: str, price: str | None) -> str:
    return str(uuid.uuid5(_SEED_NAMESPACE, f"{title}|{category}|{price or ''}"))


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "item"


def _build_record(row: dict) -> dict | None:
    """Validate and normalize one CSV row into an insertable column dict, or
    None if the row is missing data required for a usable catalog entry."""
    title = (row.get("title") or "").strip()
    if not title:
        return None

    category = (row.get("category") or "product").strip()
    image_url = row.get("imageUrl") or None
    uniq_id = _deterministic_uniq_id(title, category, row.get("price"))

    return {
        "uniq_id": uniq_id,
        "title": title,
        # Deterministic from uniq_id (itself content-derived), so this stays
        # unique per row without a DB round-trip during bulk insert.
        "slug": f"{_slugify(title)}-{uniq_id[:8]}",
        "product_url": image_url,
        "retail_price": _to_decimal(row.get("price")),
        "discount": _to_decimal(row.get("discount")),
        "image_urls": image_url or "",
        "description": row.get("description") or None,
        "category": category,
        "sub_category": (row.get("sub_category") or "sub-product").strip(),
        "brand": (row.get("brand") or "brand").strip(),
        "rating": _to_decimal(row.get("rating")),
        "review_count": 0,
        "seller_id": None,
    }


def _chunk(items: list[dict], size: int) -> Iterator[list[dict]]:
    for start in range(0, len(items), size):
        yield items[start : start + size]


async def _insert_batch(db: AsyncSession, batch: list[dict]) -> int:
    """Insert one batch, skipping rows that collide on uniq_id. Returns the
    number of rows actually inserted (Postgres omits conflicted rows from
    the command tag, so `rowcount` already excludes them)."""
    stmt = pg_insert(Product.__table__).values(batch).on_conflict_do_nothing(index_elements=["uniq_id"])
    result = await db.execute(stmt)
    await db.commit()
    return result.rowcount or 0


async def _insert_batch_with_fallback(db: AsyncSession, batch: list[dict]) -> dict:
    """Try the batch as one statement; if it fails for any reason, roll back
    and retry row-by-row so one bad record doesn't sink its whole batch."""
    try:
        inserted = await _insert_batch(db, batch)
        return {"inserted": inserted, "skipped": len(batch) - inserted, "failed": 0}
    except Exception as exc:
        await db.rollback()
        log.warning("seed_batch_failed_retrying_rows", batch_size=len(batch), error=str(exc))

        inserted = skipped = failed = 0
        for record in batch:
            try:
                row_inserted = await _insert_batch(db, [record])
                inserted += row_inserted
                skipped += 1 - row_inserted
            except Exception as row_exc:
                await db.rollback()
                failed += 1
                log.error("seed_row_failed", title=record.get("title"), error=str(row_exc))
        return {"inserted": inserted, "skipped": skipped, "failed": failed}


async def seed_from_csv(db: AsyncSession, csv_path: str, *, batch_size: int = 500) -> dict:
    start = time.monotonic()
    log.info("seed_started", csv_path=csv_path, batch_size=batch_size)

    repo = ProductRepository(db)
    if await repo.count() > 0:
        log.info("seed_skipped_already_seeded")
        return {"message": "Products already exist in the database.", "seeded": 0}

    rows = await asyncio.to_thread(_read_rows, csv_path)  # blocking file IO off the event loop
    if rows is None:
        log.warning("seed_csv_not_found", csv_path=csv_path)
        return {"message": f"Seed file not found: {csv_path}", "seeded": 0}

    total_rows = len(rows)
    valid_records: list[dict] = []
    invalid_rows = 0
    for index, row in enumerate(rows):
        record = _build_record(row)
        if record is None:
            invalid_rows += 1
            log.warning("seed_row_invalid", row_index=index, reason="missing title")
            continue
        valid_records.append(record)

    batches = list(_chunk(valid_records, batch_size))
    inserted = skipped = failed = 0
    for batch_num, batch in enumerate(batches, start=1):
        outcome = await _insert_batch_with_fallback(db, batch)
        inserted += outcome["inserted"]
        skipped += outcome["skipped"]
        failed += outcome["failed"]
        log.info(
            "seed_batch_progress",
            batch=batch_num,
            total_batches=len(batches),
            rows_processed=min(batch_num * batch_size, len(valid_records)),
            total_rows=total_rows,
            inserted_so_far=inserted,
            skipped_so_far=skipped,
            failed_so_far=failed,
        )

    stats = {
        "message": "Products initialized successfully!",
        "seeded": inserted,
        "total_rows": total_rows,
        "inserted": inserted,
        "skipped_duplicates": skipped,
        "invalid_rows": invalid_rows,
        "failed_inserts": failed,
        "elapsed_seconds": round(time.monotonic() - start, 2),
    }
    log.info("seed_completed", **stats)
    return stats
