"""Integration tests for `catalog_seeder.seed_full_catalog` against a
migrated-but-empty test DB: populates all 13 tables from the real generated
seed files, is idempotent on a second run, and leaves surrogate-PK sequences
correctly resynced for subsequent ORM-driven inserts (checked for Brand and
Product — the mechanism is identical across every `_load_table` call)."""

from pathlib import Path

import pytest
from product_service.catalog_seeder import seed_full_catalog
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
from sqlalchemy import func, select

pytestmark = pytest.mark.integration

SEED_DIR = Path(__file__).resolve().parents[2] / "seed" / "catalog"

ALL_MODELS = [
    Manufacturer,
    Brand,
    Category,
    Tag,
    ProductAttribute,
    AttributeValue,
    Collection,
    Product,
    CollectionProduct,
    ProductTag,
    ProductVariant,
    ProductVariantAttributeValue,
    ProductImage,
]


async def _count(db, model) -> int:
    return (await db.execute(select(func.count()).select_from(model))).scalar_one()


async def test_seed_full_catalog_populates_all_tables(db):
    stats = await seed_full_catalog(db, str(SEED_DIR), batch_size=500)
    assert stats["seeded"] > 0
    assert set(stats["tables"]) == {
        "manufacturers",
        "brands",
        "categories",
        "tags",
        "product_attributes",
        "attribute_values",
        "collections",
        "products",
        "collection_products",
        "product_tags",
        "product_variants",
        "product_variant_attribute_values",
        "product_images",
    }

    for model in ALL_MODELS:
        count = await _count(db, model)
        assert count > 0, f"{model.__tablename__} was not populated"


async def test_seed_full_catalog_is_idempotent(db):
    await seed_full_catalog(db, str(SEED_DIR), batch_size=500)
    before = {model.__tablename__: await _count(db, model) for model in ALL_MODELS}

    stats = await seed_full_catalog(db, str(SEED_DIR), batch_size=500)
    assert stats == {"message": "Catalog already seeded.", "seeded": 0}

    after = {model.__tablename__: await _count(db, model) for model in ALL_MODELS}
    assert before == after


async def test_seed_full_catalog_resyncs_sequences_for_new_orm_inserts(db):
    await seed_full_catalog(db, str(SEED_DIR), batch_size=500)

    brand = Brand(name="Post-Seed Brand", slug="post-seed-brand")
    db.add(brand)
    await db.flush()
    assert brand.id is not None

    product = Product(title="Post-Seed Product", slug="post-seed-product", attributes={})
    db.add(product)
    await db.flush()
    assert product.id is not None

    await db.commit()


async def test_seed_full_catalog_disabled_without_seed_dir(db):
    stats = await seed_full_catalog(db, "", batch_size=500)
    assert stats == {"message": "Seeding disabled: SEED_CATALOG_DIR not configured.", "seeded": 0}


async def test_seed_full_catalog_missing_dir_reports_missing_files_not_crash(db, tmp_path):
    stats = await seed_full_catalog(db, str(tmp_path / "does-not-exist"), batch_size=500)
    assert stats["seeded"] == 0
    for table_stats in stats["tables"].values():
        assert table_stats["rows"] == 0
