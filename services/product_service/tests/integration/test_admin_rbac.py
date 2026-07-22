"""RBAC on admin-only master-data mutation endpoints (brand/manufacturer/
category/tag/collection/attribute create) — `require_admin` must reject
SELLER and anonymous callers, and accept ADMIN."""

import pytest

pytestmark = pytest.mark.integration

ADMIN_CREATE_CASES = [
    ("/admin/products/brands", {"name": "Acme", "slug": "acme"}),
    ("/admin/products/manufacturers", {"name": "Acme Manufacturing"}),
    ("/admin/products/categories", {"name": "Electronics"}),
    ("/admin/products/tags", {"name": "Bestseller", "slug": "bestseller"}),
    ("/admin/products/collections", {"name": "Summer Sale", "slug": "summer-sale"}),
    ("/admin/products/attributes", {"name": "Color", "code": "color"}),
]


@pytest.mark.parametrize(("path", "payload"), ADMIN_CREATE_CASES, ids=[c[0] for c in ADMIN_CREATE_CASES])
async def test_admin_only_create_endpoints_reject_seller(client, as_seller, path, payload):
    as_seller("42")
    resp = await client.post(path, json=payload)
    assert resp.status_code == 403


@pytest.mark.parametrize(("path", "payload"), ADMIN_CREATE_CASES, ids=[c[0] for c in ADMIN_CREATE_CASES])
async def test_admin_only_create_endpoints_reject_anonymous(client, as_anonymous, path, payload):
    as_anonymous()
    resp = await client.post(path, json=payload)
    assert resp.status_code == 401


@pytest.mark.parametrize(("path", "payload"), ADMIN_CREATE_CASES, ids=[c[0] for c in ADMIN_CREATE_CASES])
async def test_admin_only_create_endpoints_allow_admin(client, as_admin, path, payload):
    as_admin()
    resp = await client.post(path, json=payload)
    assert resp.status_code == 201


async def test_seed_endpoint_rejects_seller(client, as_seller):
    as_seller("42")
    resp = await client.post("/admin/products/seed")
    assert resp.status_code == 403


async def test_seed_endpoint_allows_admin(client, as_admin):
    as_admin()
    # SEED_CSV_PATH is unset in the test env -> disabled-but-200, not 403;
    # this only proves the RBAC gate lets an admin through.
    resp = await client.post("/admin/products/seed")
    assert resp.status_code == 200


async def test_brand_delete_rejects_seller(client, as_seller, as_admin):
    as_admin()
    brand = (await client.post("/admin/products/brands", json={"name": "Acme", "slug": "acme"})).json()

    as_seller("42")
    resp = await client.delete(f"/admin/products/brands/{brand['id']}")
    assert resp.status_code == 403


async def test_category_update_rejects_seller(client, as_admin, as_seller):
    as_admin()
    category = (await client.post("/admin/products/categories", json={"name": "Electronics"})).json()

    as_seller("42")
    resp = await client.put(f"/admin/products/categories/{category['id']}", json={"sort_order": 5})
    assert resp.status_code == 403


async def test_attribute_value_create_rejects_seller(client, as_admin, as_seller):
    as_admin()
    attribute = (await client.post("/admin/products/attributes", json={"name": "Size", "code": "size"})).json()

    as_seller("42")
    resp = await client.post(f"/admin/products/attributes/{attribute['id']}/values", json={"value": "Large"})
    assert resp.status_code == 403
