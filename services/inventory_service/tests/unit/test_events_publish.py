from ecom_common.auth import Role, TokenPayload
from ecom_common.events import EventType, Topics
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


def _published_event_types(app) -> list[str]:
    return [call.args[1].event_type for call in app.state.producer.publish.call_args_list]


async def test_create_inventory_publishes_inventory_created(app, client):
    as_seller(app)
    await client.post("/inventory", json={"product_id": 1, "sku": "SKU-1", "available_quantity": 10})

    app.state.producer.publish.assert_awaited_once()
    topic, envelope = app.state.producer.publish.call_args.args
    assert topic == Topics.INVENTORY
    assert envelope.event_type == EventType.INVENTORY_CREATED
    assert envelope.partition_key == "1"
    assert envelope.payload["product_id"] == 1


async def test_update_inventory_publishes_inventory_updated(app, client):
    as_seller(app)
    await client.post("/inventory", json={"product_id": 1, "sku": "SKU-1", "available_quantity": 10})
    app.state.producer.publish.reset_mock()

    await client.put("/inventory/1", json={"reorder_threshold": 20, "version": 1})
    assert _published_event_types(app) == [EventType.INVENTORY_UPDATED]


async def test_reserve_publishes_inventory_reserved(app, client):
    as_seller(app)
    await client.post("/inventory", json={"product_id": 1, "sku": "SKU-1", "available_quantity": 10})
    app.state.producer.publish.reset_mock()

    await client.post("/inventory/1/reserve", json={"order_id": "order-1", "quantity": 3})
    assert EventType.INVENTORY_RESERVED in _published_event_types(app)


async def test_reserve_triggers_low_stock_detected_on_edge_transition(app, client):
    as_seller(app)
    await client.post("/inventory", json={"product_id": 1, "sku": "SKU-1", "available_quantity": 6, "reorder_threshold": 5})
    app.state.producer.publish.reset_mock()

    await client.post("/inventory/1/reserve", json={"order_id": "order-1", "quantity": 5})  # leaves 1 <= threshold 5
    types = _published_event_types(app)
    assert EventType.INVENTORY_RESERVED in types
    assert EventType.LOW_STOCK_DETECTED in types


async def test_reserve_does_not_repeat_low_stock_event_once_already_low(app, client):
    as_seller(app)
    await client.post("/inventory", json={"product_id": 1, "sku": "SKU-1", "available_quantity": 20, "reorder_threshold": 15})
    await client.post("/inventory/1/reserve", json={"order_id": "order-1", "quantity": 6})  # -> LOW_STOCK (14 left)
    app.state.producer.publish.reset_mock()

    await client.post("/inventory/1/reserve", json={"order_id": "order-2", "quantity": 1})  # still LOW_STOCK, no new edge
    assert EventType.LOW_STOCK_DETECTED not in _published_event_types(app)


async def test_release_publishes_inventory_released(app, client):
    as_seller(app)
    await client.post("/inventory", json={"product_id": 1, "sku": "SKU-1", "available_quantity": 10})
    await client.post("/inventory/1/reserve", json={"order_id": "order-1", "quantity": 3})
    app.state.producer.publish.reset_mock()

    await client.post("/inventory/1/release", json={"order_id": "order-1"})
    assert _published_event_types(app) == [EventType.INVENTORY_RELEASED]


async def test_restock_publishes_stock_restored(app, client):
    as_seller(app)
    await client.post("/inventory", json={"product_id": 1, "sku": "SKU-1", "available_quantity": 10})
    app.state.producer.publish.reset_mock()

    await client.post("/inventory/1/restock", json={"quantity": 5})
    assert _published_event_types(app) == [EventType.STOCK_RESTORED]


async def test_adjust_publishes_inventory_updated(app, client):
    as_seller(app)
    await client.post("/inventory", json={"product_id": 1, "sku": "SKU-1", "available_quantity": 10})
    app.state.producer.publish.reset_mock()

    as_admin(app)
    await client.post("/inventory/1/adjust", json={"delta": -2, "reason": "test"})
    assert EventType.INVENTORY_UPDATED in _published_event_types(app)


async def test_bulk_update_publishes_one_event_per_changed_item(app, client):
    as_seller(app)
    await client.post("/inventory", json={"product_id": 1, "sku": "SKU-1", "available_quantity": 10})
    await client.post("/inventory", json={"product_id": 2, "sku": "SKU-2", "available_quantity": 10})
    app.state.producer.publish.reset_mock()

    as_admin(app)
    await client.post(
        "/admin/inventory/bulk-update",
        json={"items": [{"product_id": 1, "reorder_threshold": 25}, {"product_id": 2, "reorder_threshold": 30}]},
    )
    types = _published_event_types(app)
    assert types.count(EventType.INVENTORY_UPDATED) == 2
