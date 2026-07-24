"""Soft-delete: DELETE /products/{id} must set is_deleted/deleted_at/deleted_by
without removing the row, and every read path (get, list, nested
variants/images) must treat a soft-deleted product exactly as gone.

Note: `create_product` always starts a product at DRAFT (see
conftest.py::publish_product's docstring), and the public read paths this
suite exercises (get_product/list_products/list_variants/list_images) only
surface PUBLISHED products. Tests that assert on those read paths therefore
publish the product first via the `publish_product` fixture (direct DB
write — there's no API to do this yet), so the assertions are actually
isolated to soft-delete's effect rather than being masked by DRAFT-gating."""

import pytest
from product_service.models import Product
from sqlalchemy import select

pytestmark = pytest.mark.integration


async def _create_product(client, as_seller, *, title="Widget", seller="42"):
    as_seller(seller)
    # `attributes` is passed explicitly (rather than omitted) to sidestep a
    # separate bug in create_product where an omitted `attributes` field
    # stores a JSONB `null` instead of `{}` and 500s on response
    # serialization — see test_product_crud.py::test_create_product_omitted_attributes_is_broken.
    resp = await client.post("/products", json={"title": title, "retail_price": "9.99", "attributes": {}})
    assert resp.status_code == 201
    return resp.json()


async def test_soft_delete_sets_flags_but_keeps_row(client, as_seller, db):
    product = await _create_product(client, as_seller)
    product_id = product["id"]

    as_seller("42")
    resp = await client.delete(f"/products/{product_id}")
    assert resp.status_code == 204

    row = (await db.execute(select(Product).where(Product.id == product_id))).scalar_one()
    assert row.is_deleted is True
    assert row.deleted_at is not None
    assert row.deleted_by == "42"


async def test_get_soft_deleted_product_returns_404(client, as_seller, publish_product):
    product = await _create_product(client, as_seller)
    product_id = product["id"]
    await publish_product(product_id)

    as_seller("42")
    get_before = await client.get(f"/products/{product_id}")
    assert get_before.status_code == 200  # sanity: it was actually visible before delete

    await client.delete(f"/products/{product_id}")

    resp = await client.get(f"/products/{product_id}")
    assert resp.status_code == 404


async def test_soft_deleted_product_excluded_from_list(client, as_seller, publish_product):
    kept = await _create_product(client, as_seller, title="Kept Product")
    deleted = await _create_product(client, as_seller, title="Deleted Product")
    await publish_product(kept["id"])
    await publish_product(deleted["id"])

    as_seller("42")
    resp = await client.delete(f"/products/{deleted['id']}")
    assert resp.status_code == 204

    resp = await client.get("/products", params={"page_size": 100})
    assert resp.status_code == 200
    ids = {p["id"] for p in resp.json()["products"]}
    assert kept["id"] in ids
    assert deleted["id"] not in ids


async def test_soft_deleted_product_variants_unreachable(client, as_seller, publish_product):
    product = await _create_product(client, as_seller)
    product_id = product["id"]

    as_seller("42")
    variant_resp = await client.post(
        f"/products/{product_id}/variants",
        json={"variant_name": "Red / L"},
    )
    assert variant_resp.status_code == 201

    await publish_product(product_id)
    list_before = await client.get(f"/products/{product_id}/variants")
    assert list_before.status_code == 200  # sanity: reachable while published + not deleted

    await client.delete(f"/products/{product_id}")

    resp = await client.get(f"/products/{product_id}/variants")
    assert resp.status_code == 404


async def test_soft_deleted_product_images_unreachable(client, as_seller, publish_product):
    product = await _create_product(client, as_seller)
    product_id = product["id"]

    as_seller("42")
    image_resp = await client.post(
        f"/products/{product_id}/images",
        json={"url": "https://cdn.example.com/img.jpg"},
    )
    assert image_resp.status_code == 201

    await publish_product(product_id)
    list_before = await client.get(f"/products/{product_id}/images")
    assert list_before.status_code == 200

    await client.delete(f"/products/{product_id}")

    resp = await client.get(f"/products/{product_id}/images")
    assert resp.status_code == 404


async def test_delete_requires_seller_or_admin(client, as_seller, as_anonymous):
    product = await _create_product(client, as_seller)

    as_anonymous()
    resp = await client.delete(f"/products/{product['id']}")
    assert resp.status_code == 401
