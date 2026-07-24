from ecom_common.auth import Role, TokenPayload
from fastapi import FastAPI
from inventory_service.deps import get_current_user


def as_seller(app: FastAPI) -> None:
    app.dependency_overrides[get_current_user] = lambda: TokenPayload(
        sub="42", email="seller@example.com", username="seller", role=Role.SELLER, jti="jti-seller", exp=9999999999, iat=0
    )


def as_admin(app: FastAPI) -> None:
    app.dependency_overrides[get_current_user] = lambda: TokenPayload(
        sub="1", email="admin@example.com", username="admin", role=Role.ADMIN, jti="jti-admin", exp=9999999999, iat=0
    )


async def test_get_inventory_populates_cache(app, client, redis):
    as_seller(app)
    await client.post("/inventory", json={"product_id": 1, "sku": "SKU-1", "available_quantity": 10})
    assert await redis.get("cache:inventory:1") is None

    resp = await client.get("/inventory/1")
    assert resp.status_code == 200
    assert await redis.get("cache:inventory:1") is not None


async def test_write_paths_invalidate_cache(app, client, redis):
    as_seller(app)
    await client.post("/inventory", json={"product_id": 1, "sku": "SKU-1", "available_quantity": 10})
    await client.get("/inventory/1")
    assert await redis.get("cache:inventory:1") is not None

    await client.post("/inventory/1/restock", json={"quantity": 5})
    assert await redis.get("cache:inventory:1") is None


async def test_get_inventory_serves_from_cache_without_db_hit(app, client, redis):
    as_seller(app)
    await client.post("/inventory", json={"product_id": 1, "sku": "SKU-1", "available_quantity": 10})
    first = await client.get("/inventory/1")
    assert first.status_code == 200

    # Mutate the cached payload directly to prove the second read comes from
    # Redis, not a fresh DB query.
    import json

    cached = await redis.get("cache:inventory:1")
    payload = json.loads(cached)
    payload["available_quantity"] = 999
    await redis.set("cache:inventory:1", json.dumps(payload))

    second = await client.get("/inventory/1")
    assert second.json()["available_quantity"] == 999


async def test_health_report_cache_not_point_invalidated_on_write(app, client, redis):
    """Whole-table aggregate: cached with a short TTL and left to expire, not
    invalidated on every inventory write (unlike the per-product cache)."""
    as_seller(app)
    await client.post("/inventory", json={"product_id": 1, "sku": "SKU-1", "available_quantity": 10})
    as_admin(app)
    first = await client.get("/admin/inventory/health-report")
    assert first.json()["total_skus"] == 1
    assert await redis.get("cache:inventory:health-report") is not None

    as_seller(app)
    await client.post("/inventory", json={"product_id": 2, "sku": "SKU-2", "available_quantity": 10})

    # Cache key still present (not deleted by the second product's creation).
    assert await redis.get("cache:inventory:health-report") is not None
    as_admin(app)
    second = await client.get("/admin/inventory/health-report")
    assert second.json()["total_skus"] == 1  # stale-but-cached, by design
