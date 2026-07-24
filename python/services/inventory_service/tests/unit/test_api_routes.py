"""Full-app API tests via httpx.AsyncClient + ASGITransport, faking auth with
FastAPI dependency_overrides. This is a new test pattern for the repo (no
existing service test builds a full ASGI app this way) — auth/product tests
exercise service/security functions directly instead."""

from ecom_common.auth import Role, TokenPayload
from fastapi import FastAPI
from inventory_service.deps import get_current_user


def _seller_token() -> TokenPayload:
    return TokenPayload(sub="42", email="seller@example.com", username="seller", role=Role.SELLER, jti="jti-seller", exp=9999999999, iat=0)


def _admin_token() -> TokenPayload:
    return TokenPayload(sub="1", email="admin@example.com", username="admin", role=Role.ADMIN, jti="jti-admin", exp=9999999999, iat=0)


def as_seller(app: FastAPI) -> None:
    app.dependency_overrides[get_current_user] = _seller_token


def as_admin(app: FastAPI) -> None:
    app.dependency_overrides[get_current_user] = _admin_token


def as_anonymous(app: FastAPI) -> None:
    app.dependency_overrides.pop(get_current_user, None)


async def test_create_inventory(app, client):
    as_seller(app)
    resp = await client.post("/inventory", json={"product_id": 1, "sku": "SKU-1", "available_quantity": 10, "reorder_threshold": 5})
    assert resp.status_code == 201
    body = resp.json()
    assert body["product_id"] == 1
    assert body["status"] == "IN_STOCK"


async def test_create_inventory_requires_seller_role(app, client):
    as_anonymous(app)
    resp = await client.post("/inventory", json={"product_id": 1, "sku": "SKU-1", "available_quantity": 10})
    assert resp.status_code == 401


async def test_create_inventory_conflict_on_duplicate_product(app, client):
    as_seller(app)
    payload = {"product_id": 1, "sku": "SKU-1", "available_quantity": 10}
    await client.post("/inventory", json=payload)
    resp = await client.post("/inventory", json={**payload, "sku": "SKU-2"})
    assert resp.status_code == 409


async def test_get_inventory_not_found(app, client):
    resp = await client.get("/inventory/999")
    assert resp.status_code == 404


async def test_get_inventory_populates_cache(app, client, redis):
    as_seller(app)
    await client.post("/inventory", json={"product_id": 1, "sku": "SKU-1", "available_quantity": 10})
    resp = await client.get("/inventory/1")
    assert resp.status_code == 200
    assert await redis.get("cache:inventory:1") is not None


async def test_list_inventory(app, client):
    as_seller(app)
    for i in range(1, 4):
        await client.post("/inventory", json={"product_id": i, "sku": f"SKU-{i}", "available_quantity": 10})
    resp = await client.get("/inventory")
    assert resp.status_code == 200
    assert resp.json()["pagination"]["total_items"] == 3


async def test_update_inventory_stale_version_conflicts(app, client):
    as_seller(app)
    await client.post("/inventory", json={"product_id": 1, "sku": "SKU-1", "available_quantity": 10})
    r1 = await client.put("/inventory/1", json={"reorder_threshold": 20, "version": 1})
    assert r1.status_code == 200
    r2 = await client.put("/inventory/1", json={"reorder_threshold": 30, "version": 1})
    assert r2.status_code == 409


async def test_reserve_and_release_stock(app, client, redis):
    as_seller(app)
    await client.post("/inventory", json={"product_id": 1, "sku": "SKU-1", "available_quantity": 10})
    r = await client.post("/inventory/1/reserve", json={"order_id": "order-1", "quantity": 3})
    assert r.status_code == 200
    assert r.json()["reserved_quantity"] == 3
    assert await redis.get("cache:inventory:1") is None  # invalidated

    r2 = await client.post("/inventory/1/release", json={"order_id": "order-1"})
    assert r2.status_code == 200
    assert r2.json()["reserved_quantity"] == 0


async def test_reserve_insufficient_stock_conflicts(app, client):
    as_seller(app)
    await client.post("/inventory", json={"product_id": 1, "sku": "SKU-1", "available_quantity": 2})
    r = await client.post("/inventory/1/reserve", json={"order_id": "order-1", "quantity": 5})
    assert r.status_code == 409


async def test_release_without_reservation_not_found(app, client):
    as_seller(app)
    await client.post("/inventory", json={"product_id": 1, "sku": "SKU-1", "available_quantity": 10})
    r = await client.post("/inventory/1/release", json={"order_id": "no-such-order"})
    assert r.status_code == 404


async def test_restock(app, client):
    as_seller(app)
    await client.post("/inventory", json={"product_id": 1, "sku": "SKU-1", "available_quantity": 10})
    r = await client.post("/inventory/1/restock", json={"quantity": 5})
    assert r.status_code == 200
    assert r.json()["available_quantity"] == 15


async def test_adjust_forbidden_for_seller(app, client):
    as_seller(app)
    await client.post("/inventory", json={"product_id": 1, "sku": "SKU-1", "available_quantity": 10})
    r = await client.post("/inventory/1/adjust", json={"delta": -2, "reason": "test"})
    assert r.status_code == 403


async def test_adjust_allowed_for_admin(app, client):
    as_seller(app)
    await client.post("/inventory", json={"product_id": 1, "sku": "SKU-1", "available_quantity": 10})
    as_admin(app)
    r = await client.post("/inventory/1/adjust", json={"delta": -2, "reason": "test"})
    assert r.status_code == 200
    assert r.json()["available_quantity"] == 8


async def test_bulk_update_partial_success(app, client):
    as_seller(app)
    await client.post("/inventory", json={"product_id": 1, "sku": "SKU-1", "available_quantity": 10})
    as_admin(app)
    r = await client.post(
        "/admin/inventory/bulk-update",
        json={"items": [{"product_id": 1, "reorder_threshold": 25}, {"product_id": 999, "reorder_threshold": 5}]},
    )
    assert r.status_code == 200
    results = r.json()
    assert results[0]["success"] is True
    assert results[1]["success"] is False


async def test_bulk_update_forbidden_for_seller(app, client):
    as_seller(app)
    r = await client.post("/admin/inventory/bulk-update", json={"items": [{"product_id": 1}]})
    assert r.status_code == 403


async def test_health_report(app, client):
    as_seller(app)
    await client.post("/inventory", json={"product_id": 1, "sku": "SKU-1", "available_quantity": 10})
    as_admin(app)
    r = await client.get("/admin/inventory/health-report")
    assert r.status_code == 200
    assert r.json()["total_skus"] == 1


async def test_reports_routes_not_shadowed_by_product_id(app, client):
    """Regression check: /inventory/reports/* must be matched before
    /inventory/{product_id}, or FastAPI would 422 trying to parse 'reports'
    as an int."""
    as_seller(app)
    r1 = await client.get("/inventory/reports/low-stock")
    assert r1.status_code == 200
    r2 = await client.get("/inventory/reports/out-of-stock")
    assert r2.status_code == 200


async def test_internal_get_inventory_no_auth_required(app, client):
    as_seller(app)
    await client.post("/inventory", json={"product_id": 1, "sku": "SKU-1", "available_quantity": 10})
    as_anonymous(app)
    r = await client.get("/internal/inventory/1")
    assert r.status_code == 200
