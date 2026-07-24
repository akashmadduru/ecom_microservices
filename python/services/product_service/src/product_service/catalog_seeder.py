"""Full 13-table catalog seeder. Loads the gzip'd JSON files produced by
`scripts/generate_seed_data.py` (manufacturers, brands, categories, tags,
attributes/values, collections, products, variants, images, and their
association tables) with the same `INSERT ... ON CONFLICT DO NOTHING` +
row-by-row-fallback machinery as the CSV seeder (see `_seed_utils.py`).

The 10 tables with a surrogate `id` PK use `id` as the conflict target — the
generator assigns deterministic sequential ids, so re-running the seed always
maps the same source row to the same `id` and skips it on conflict. The 3
pure association tables (no `id` column) use their composite PK instead.
"""

import time
from dataclasses import dataclass
from pathlib import Path

from ecom_common.logging import get_logger
from sqlalchemy import Table
from sqlalchemy.ext.asyncio import AsyncSession

from product_service._seed_utils import chunk, insert_batch_with_fallback, read_gzip_json, resync_sequence
from product_service.models import (
    AttributeValue,
    Brand,
    Category,
    Collection,
    CollectionProduct,
    Manufacturer,
    Product,
    ProductAttribute,
    ProductImage,
    ProductTag,
    ProductVariant,
    ProductVariantAttributeValue,
    Tag,
)
from product_service.repo import ProductImageRepository

log = get_logger("product.catalog_seeder")


@dataclass(frozen=True)
class _TableSeed:
    """One row of the declarative load table: everything `_load_table` needs
    to load a single table's seed file, in the exact shape the previous
    per-table `load_*` wrapper functions used to hardcode."""

    name: str
    filename: str
    table: Table
    conflict_index_elements: tuple[str, ...]
    resync_sequence: bool = True
    # Column(s) used to label a failed row in `seed_row_failed` logs. A single
    # surrogate-PK column name for the 10 normal tables; a tuple of the
    # composite-PK columns for the 3 pure association tables, which have no
    # `id` column to fall back on.
    row_label_field: str | tuple[str, ...] = "id"


# Executed in this exact order: parents before children, association tables
# after both sides of their FK exist.
_TABLE_SEEDS: tuple[_TableSeed, ...] = (
    _TableSeed("manufacturers", "manufacturers.json.gz", Manufacturer.__table__, ("id",)),
    _TableSeed("brands", "brands.json.gz", Brand.__table__, ("id",)),
    _TableSeed("categories", "categories.json.gz", Category.__table__, ("id",)),
    _TableSeed("tags", "tags.json.gz", Tag.__table__, ("id",)),
    _TableSeed("product_attributes", "product_attributes.json.gz", ProductAttribute.__table__, ("id",)),
    _TableSeed("attribute_values", "attribute_values.json.gz", AttributeValue.__table__, ("id",)),
    _TableSeed("collections", "collections.json.gz", Collection.__table__, ("id",)),
    _TableSeed("products", "products.json.gz", Product.__table__, ("id",)),
    _TableSeed(
        "collection_products",
        "collection_products.json.gz",
        CollectionProduct.__table__,
        ("collection_id", "product_id"),
        resync_sequence=False,
        row_label_field=("collection_id", "product_id"),
    ),
    _TableSeed(
        "product_tags",
        "product_tags.json.gz",
        ProductTag.__table__,
        ("product_id", "tag_id"),
        resync_sequence=False,
        row_label_field=("product_id", "tag_id"),
    ),
    _TableSeed("product_variants", "product_variants.json.gz", ProductVariant.__table__, ("id",)),
    _TableSeed(
        "product_variant_attribute_values",
        "product_variant_attribute_values.json.gz",
        ProductVariantAttributeValue.__table__,
        ("variant_id", "attribute_value_id"),
        resync_sequence=False,
        row_label_field=("variant_id", "attribute_value_id"),
    ),
    _TableSeed("product_images", "product_images.json.gz", ProductImage.__table__, ("id",)),
)


async def _load_table(db: AsyncSession, seed_dir: Path, config: _TableSeed, *, batch_size: int) -> dict:
    start = time.monotonic()
    rows = await read_gzip_json(seed_dir / config.filename)
    if rows is None:
        log.warning("catalog_seed_file_not_found", filename=config.filename)
        return {
            "rows": 0,
            "inserted": 0,
            "skipped": 0,
            "failed": 0,
            "elapsed_seconds": 0.0,
            "message": f"Seed file not found: {config.filename}",
        }

    inserted = skipped = failed = 0
    # `commit=False`: batches within a table share one transaction, committed
    # once below (after the sequence resync) instead of once per ~500-row
    # batch — this bulk load is fully idempotent (ON CONFLICT DO NOTHING) and
    # replayable from the top on any crash, so per-batch durability here buys
    # nothing but ~15x more fsync'd transactions than necessary.
    for batch in chunk(rows, batch_size):
        outcome = await insert_batch_with_fallback(
            db,
            config.table,
            batch,
            conflict_index_elements=config.conflict_index_elements,
            row_label_field=config.row_label_field,
            commit=False,
        )
        inserted += outcome["inserted"]
        skipped += outcome["skipped"]
        failed += outcome["failed"]

    if config.resync_sequence:
        # Same uncommitted transaction: MAX(id) already sees every row
        # inserted by the batch loop above, so resyncing before the commit
        # below is safe — a transaction always sees its own writes.
        await resync_sequence(db, config.table.name, commit=False)

    await db.commit()

    return {
        "rows": len(rows),
        "inserted": inserted,
        "skipped": skipped,
        "failed": failed,
        "elapsed_seconds": round(time.monotonic() - start, 2),
    }


async def seed_full_catalog(db: AsyncSession, seed_dir: str, *, batch_size: int = 500) -> dict:
    print(seed_dir)
    if not seed_dir:
        return {"message": "Seeding disabled: SEED_CATALOG_DIR not configured.", "seeded": 0}

    start = time.monotonic()
    log.info("catalog_seed_started", seed_dir=seed_dir, batch_size=batch_size)

    # Deliberately checks the LAST-loaded table (product_images), not the
    # first: per-table inserts are idempotent (ON CONFLICT DO NOTHING), so a
    # crash mid-seed is cheap to just re-run from the top. Checking the first
    # table instead would permanently freeze the catalog half-seeded forever
    # after any crash between "manufacturers loaded" and "images loaded".
    if await ProductImageRepository(db).count() > 0:
        log.info("catalog_seed_skipped_already_seeded")
        return {"message": "Catalog already seeded.", "seeded": 0}

    seed_path = Path(seed_dir)
    tables: dict[str, dict] = {}
    total_rows = total_inserted = total_skipped = total_failed = 0
    for config in _TABLE_SEEDS:
        stats = await _load_table(db, seed_path, config, batch_size=batch_size)
        tables[config.name] = stats
        total_rows += stats["rows"]
        total_inserted += stats["inserted"]
        total_skipped += stats["skipped"]
        total_failed += stats["failed"]
        log.info("catalog_seed_table_completed", table=config.name, **stats)

    totals = {
        "message": "Catalog seeded successfully!",
        "seeded": total_inserted,
        "total_rows": total_rows,
        "inserted": total_inserted,
        "skipped_duplicates": total_skipped,
        "failed_inserts": total_failed,
        "tables": tables,
        "elapsed_seconds": round(time.monotonic() - start, 2),
    }
    log.info(
        "catalog_seed_completed",
        seeded=total_inserted,
        total_rows=total_rows,
        inserted=total_inserted,
        skipped_duplicates=total_skipped,
        failed_inserts=total_failed,
        elapsed_seconds=totals["elapsed_seconds"],
    )
    return totals
