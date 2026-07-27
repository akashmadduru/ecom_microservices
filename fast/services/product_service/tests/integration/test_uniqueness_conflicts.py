"""Uniqueness/conflict handling: every unique constraint the Phase 1 schema
introduces must surface as 409 via `_create_or_conflict`/`_update_or_conflict`
(an IntegrityError caught and translated), never as a raw 500. Covers brand
name/slug, category name-under-parent, a second PRIMARY image for the same
product/variant, and duplicate barcode/upc/ean across variants — plus the
NULL-is-not-a-duplicate edge case for each partial unique index."""

import pytest

pytestmark = pytest.mark.integration


async def test_duplicate_brand_name_conflicts(client, as_admin):
    as_admin()
    resp1 = await client.post("/admin/products/brands", json={"name": "Acme", "slug": "acme-one"})
    assert resp1.status_code == 201
    resp2 = await client.post("/admin/products/brands", json={"name": "Acme", "slug": "acme-two"})
    assert resp2.status_code == 409


async def test_duplicate_brand_slug_conflicts(client, as_admin):
    as_admin()
    resp1 = await client.post("/admin/products/brands", json={"name": "Acme One", "slug": "acme"})
    assert resp1.status_code == 201
    resp2 = await client.post("/admin/products/brands", json={"name": "Acme Two", "slug": "acme"})
    assert resp2.status_code == 409


async def test_duplicate_category_name_under_same_parent_conflicts(client, as_admin):
    as_admin()
    root = (await client.post("/admin/products/categories", json={"name": "Electronics"})).json()
    resp1 = await client.post("/admin/products/categories", json={"name": "Phones", "parent_id": root["id"]})
    assert resp1.status_code == 201
    resp2 = await client.post("/admin/products/categories", json={"name": "Phones", "parent_id": root["id"]})
    assert resp2.status_code == 409


async def test_same_category_name_under_different_parents_succeeds(client, as_admin):
    as_admin()
    parent_a = (await client.post("/admin/products/categories", json={"name": "Electronics"})).json()
    parent_b = (await client.post("/admin/products/categories", json={"name": "Home"})).json()

    resp1 = await client.post("/admin/products/categories", json={"name": "Accessories", "parent_id": parent_a["id"]})
    assert resp1.status_code == 201
    resp2 = await client.post("/admin/products/categories", json={"name": "Accessories", "parent_id": parent_b["id"]})
    assert resp2.status_code == 201


async def test_second_primary_image_for_same_product_conflicts(client, as_seller):
    """Regression guard: 'uq_product_images_primary' used to be a plain
    UNIQUE(product_id, variant_id) WHERE kind='PRIMARY', and standard unique-
    index semantics treat NULL <> NULL — so two product-level PRIMARY images
    (variant_id left NULL) weren't actually rejected. Fixed by adding
    `postgresql_nulls_not_distinct=True` (Postgres 15+; this project runs
    postgres:17-alpine) to the index in both the model and migration 0005.
    """
    as_seller("42")
    product = (await client.post("/products", json={"title": "Widget", "attributes": {}})).json()

    resp1 = await client.post(f"/products/{product['id']}/images", json={"url": "https://cdn.example.com/a.jpg", "kind": "PRIMARY"})
    assert resp1.status_code == 201
    resp2 = await client.post(f"/products/{product['id']}/images", json={"url": "https://cdn.example.com/b.jpg", "kind": "PRIMARY"})
    assert resp2.status_code == 409


async def test_non_primary_images_do_not_conflict(client, as_seller):
    as_seller("42")
    product = (await client.post("/products", json={"title": "Widget", "attributes": {}})).json()

    resp1 = await client.post(f"/products/{product['id']}/images", json={"url": "https://cdn.example.com/a.jpg", "kind": "GALLERY"})
    assert resp1.status_code == 201
    resp2 = await client.post(f"/products/{product['id']}/images", json={"url": "https://cdn.example.com/b.jpg", "kind": "GALLERY"})
    assert resp2.status_code == 201


async def test_primary_image_scoped_per_variant_is_independent(client, as_seller):
    as_seller("42")
    product = (await client.post("/products", json={"title": "Widget", "attributes": {}})).json()
    variant = (await client.post(f"/products/{product['id']}/variants", json={"variant_name": "Red / L"})).json()

    # A product-level PRIMARY (variant_id=None) and a variant-scoped PRIMARY
    # sit on different keys of the partial unique index (product_id,
    # variant_id) WHERE kind='PRIMARY' — both must succeed independently.
    resp_product_level = await client.post(
        f"/products/{product['id']}/images", json={"url": "https://cdn.example.com/product.jpg", "kind": "PRIMARY"}
    )
    assert resp_product_level.status_code == 201

    resp_variant_level = await client.post(
        f"/products/{product['id']}/images",
        json={"url": "https://cdn.example.com/variant.jpg", "kind": "PRIMARY", "variant_id": variant["id"]},
    )
    assert resp_variant_level.status_code == 201


async def test_duplicate_barcode_across_variants_conflicts(client, as_seller):
    """Regression guard: create_variant used to call `await db.flush()`
    (needed to obtain the new variant's id for the
    ProductVariantAttributeValue join rows) BEFORE entering the
    try/except IntegrityError block, which only wrapped the later
    `await db.commit()`. A duplicate barcode/upc/ean raises IntegrityError at
    flush() time, so it propagated uncaught into the generic 500 handler
    instead of being translated to 409. Fixed by moving the flush inside the
    try block."""
    as_seller("42")
    product = (await client.post("/products", json={"title": "Widget", "attributes": {}})).json()

    resp1 = await client.post(f"/products/{product['id']}/variants", json={"variant_name": "V1", "barcode": "BC-1"})
    assert resp1.status_code == 201
    resp2 = await client.post(f"/products/{product['id']}/variants", json={"variant_name": "V2", "barcode": "BC-1"})
    assert resp2.status_code == 409


async def test_duplicate_upc_across_variants_conflicts(client, as_seller):
    as_seller("42")
    product = (await client.post("/products", json={"title": "Widget", "attributes": {}})).json()

    resp1 = await client.post(f"/products/{product['id']}/variants", json={"variant_name": "V1", "upc": "UPC-1"})
    assert resp1.status_code == 201
    resp2 = await client.post(f"/products/{product['id']}/variants", json={"variant_name": "V2", "upc": "UPC-1"})
    assert resp2.status_code == 409


async def test_duplicate_ean_across_variants_conflicts(client, as_seller):
    as_seller("42")
    product = (await client.post("/products", json={"title": "Widget", "attributes": {}})).json()

    resp1 = await client.post(f"/products/{product['id']}/variants", json={"variant_name": "V1", "ean": "EAN-1"})
    assert resp1.status_code == 201
    resp2 = await client.post(f"/products/{product['id']}/variants", json={"variant_name": "V2", "ean": "EAN-1"})
    assert resp2.status_code == 409


async def test_null_barcode_does_not_conflict_across_variants(client, as_seller):
    as_seller("42")
    product = (await client.post("/products", json={"title": "Widget", "attributes": {}})).json()

    # Both omit barcode -> both NULL; the partial unique index only applies
    # WHERE barcode IS NOT NULL, so two NULLs must not conflict.
    resp1 = await client.post(f"/products/{product['id']}/variants", json={"variant_name": "V1"})
    assert resp1.status_code == 201
    resp2 = await client.post(f"/products/{product['id']}/variants", json={"variant_name": "V2"})
    assert resp2.status_code == 201


async def test_barcode_unique_across_different_products_too(client, as_seller):
    as_seller("42")
    product_a = (await client.post("/products", json={"title": "Widget A", "attributes": {}})).json()
    product_b = (await client.post("/products", json={"title": "Widget B", "attributes": {}})).json()

    resp1 = await client.post(f"/products/{product_a['id']}/variants", json={"variant_name": "V1", "barcode": "BC-GLOBAL"})
    assert resp1.status_code == 201
    resp2 = await client.post(f"/products/{product_b['id']}/variants", json={"variant_name": "V1", "barcode": "BC-GLOBAL"})
    assert resp2.status_code == 409


async def test_duplicate_tag_name_conflicts(client, as_admin):
    as_admin()
    resp1 = await client.post("/admin/products/tags", json={"name": "Bestseller", "slug": "bestseller"})
    assert resp1.status_code == 201
    resp2 = await client.post("/admin/products/tags", json={"name": "Bestseller", "slug": "bestseller-2"})
    assert resp2.status_code == 409


async def test_duplicate_collection_slug_conflicts(client, as_admin):
    as_admin()
    resp1 = await client.post("/admin/products/collections", json={"name": "Summer", "slug": "sale"})
    assert resp1.status_code == 201
    resp2 = await client.post("/admin/products/collections", json={"name": "Winter", "slug": "sale"})
    assert resp2.status_code == 409


async def test_duplicate_attribute_value_conflicts(client, as_admin):
    as_admin()
    attribute = (await client.post("/admin/products/attributes", json={"name": "Color", "code": "color"})).json()
    resp1 = await client.post(f"/admin/products/attributes/{attribute['id']}/values", json={"value": "Red"})
    assert resp1.status_code == 201
    resp2 = await client.post(f"/admin/products/attributes/{attribute['id']}/values", json={"value": "Red"})
    assert resp2.status_code == 409


async def test_brand_referenced_by_product_cannot_be_deleted(client, as_admin, as_seller):
    as_admin()
    brand = (await client.post("/admin/products/brands", json={"name": "Acme", "slug": "acme"})).json()

    as_seller("42")
    product_resp = await client.post("/products", json={"title": "Widget", "brand_id": brand["id"], "attributes": {}})
    assert product_resp.status_code == 201

    as_admin()
    resp = await client.delete(f"/admin/products/brands/{brand['id']}")
    assert resp.status_code == 409
