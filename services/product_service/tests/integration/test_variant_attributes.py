"""Variant creation attribute validation: `attribute_value_ids` must
reference existing AttributeValue rows attached to a variant-defining
ProductAttribute (`is_variant_defining=True`) — a nonexistent id or an id on
a non-variant-defining attribute is rejected with 422; a valid combination
succeeds and the `product_variant_attribute_values` join rows exist."""

import pytest
from product_service.models import ProductVariantAttributeValue
from sqlalchemy import select

pytestmark = pytest.mark.integration


async def _create_product(client, as_seller):
    as_seller("42")
    resp = await client.post("/products", json={"title": "Widget", "attributes": {}})
    assert resp.status_code == 201
    return resp.json()


async def _create_attribute(client, as_admin, name, code, *, is_variant_defining: bool):
    as_admin()
    resp = await client.post(
        "/admin/products/attributes", json={"name": name, "code": code, "is_variant_defining": is_variant_defining}
    )
    assert resp.status_code == 201
    return resp.json()


async def _create_attribute_value(client, as_admin, attribute_id: int, value: str):
    as_admin()
    resp = await client.post(f"/admin/products/attributes/{attribute_id}/values", json={"value": value})
    assert resp.status_code == 201
    return resp.json()


async def test_variant_rejects_nonexistent_attribute_value_id(client, as_seller, as_admin):
    product = await _create_product(client, as_seller)

    as_seller("42")
    resp = await client.post(
        f"/products/{product['id']}/variants",
        json={"variant_name": "Red / L", "attribute_value_ids": [999999]},
    )
    assert resp.status_code == 422


async def test_variant_rejects_non_variant_defining_attribute(client, as_seller, as_admin):
    product = await _create_product(client, as_seller)
    attribute = await _create_attribute(client, as_admin, "Warranty Type", "warranty_type", is_variant_defining=False)
    value = await _create_attribute_value(client, as_admin, attribute["id"], "Extended")

    as_seller("42")
    resp = await client.post(
        f"/products/{product['id']}/variants",
        json={"variant_name": "Red / L", "attribute_value_ids": [value["id"]]},
    )
    assert resp.status_code == 422


async def test_variant_accepts_valid_variant_defining_combination(client, as_seller, as_admin, db):
    product = await _create_product(client, as_seller)
    color = await _create_attribute(client, as_admin, "Color", "color", is_variant_defining=True)
    size = await _create_attribute(client, as_admin, "Size", "size", is_variant_defining=True)
    red = await _create_attribute_value(client, as_admin, color["id"], "Red")
    large = await _create_attribute_value(client, as_admin, size["id"], "Large")

    as_seller("42")
    resp = await client.post(
        f"/products/{product['id']}/variants",
        json={"variant_name": "Red / Large", "attribute_value_ids": [red["id"], large["id"]]},
    )
    assert resp.status_code == 201
    variant = resp.json()

    rows = (
        (
            await db.execute(
                select(ProductVariantAttributeValue.attribute_value_id).where(
                    ProductVariantAttributeValue.variant_id == variant["id"]
                )
            )
        )
        .scalars()
        .all()
    )
    assert set(rows) == {red["id"], large["id"]}


async def test_variant_rejects_mix_of_valid_and_invalid_attribute_value_ids(client, as_seller, as_admin):
    product = await _create_product(client, as_seller)
    color = await _create_attribute(client, as_admin, "Color", "color", is_variant_defining=True)
    red = await _create_attribute_value(client, as_admin, color["id"], "Red")

    as_seller("42")
    resp = await client.post(
        f"/products/{product['id']}/variants",
        json={"variant_name": "Red / ???", "attribute_value_ids": [red["id"], 999999]},
    )
    assert resp.status_code == 422


async def test_variant_with_no_attribute_value_ids_succeeds(client, as_seller):
    product = await _create_product(client, as_seller)

    as_seller("42")
    resp = await client.post(f"/products/{product['id']}/variants", json={"variant_name": "Standard"})
    assert resp.status_code == 201
