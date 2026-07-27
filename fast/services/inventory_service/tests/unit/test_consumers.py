"""Consumer handler tests using hand-built EventEnvelope fixtures — there's no
live Order/Payment producer in this repo yet, so handlers are invoked
directly (`consumer._handlers[event_type]`) rather than via a real Kafka
round-trip."""

from unittest.mock import AsyncMock

from ecom_common.events import EventType, make_event
from inventory_service.consumers import build_consumer
from inventory_service.repo import InventoryRepository


class FakeMsg:
    def __init__(self, value: str, topic: str = "order.events", offset: int = 0):
        self.value = value
        self.topic = topic
        self.offset = offset


async def _seed(session_factory, product_id=1, available=10, reorder_threshold=5):
    async with session_factory() as db:
        await InventoryRepository(db).create_inventory(
            product_id=product_id, sku=f"SKU-{product_id}", available_quantity=available, reorder_threshold=reorder_threshold
        )


async def _get_inventory(session_factory, product_id=1):
    async with session_factory() as db:
        return await InventoryRepository(db).get_by_product(product_id)


def _consumer(redis, session_factory, producer):
    return build_consumer(bootstrap_servers="localhost:29092", redis=redis, producer=producer, session_factory=session_factory)


def _published_event_types(producer) -> list[str]:
    return [call.args[1].event_type for call in producer.publish.call_args_list]


async def test_order_created_reserves_stock(session_factory, redis):
    await _seed(session_factory)
    producer = AsyncMock()
    consumer = _consumer(redis, session_factory, producer)
    envelope = make_event(
        event_type=EventType.ORDER_CREATED,
        producer="order-service",
        partition_key="order-1",
        payload={"order_id": "order-1", "items": [{"product_id": 1, "quantity": 3}]},
    )

    await consumer._handlers[EventType.ORDER_CREATED](envelope)

    inv = await _get_inventory(session_factory)
    assert inv.available_quantity == 7
    assert inv.reserved_quantity == 3
    assert EventType.INVENTORY_RESERVED in _published_event_types(producer)


async def test_order_created_insufficient_stock_is_logged_not_raised(session_factory, redis):
    await _seed(session_factory, available=1)
    producer = AsyncMock()
    consumer = _consumer(redis, session_factory, producer)
    envelope = make_event(
        event_type=EventType.ORDER_CREATED,
        producer="order-service",
        partition_key="order-1",
        payload={"order_id": "order-1", "items": [{"product_id": 1, "quantity": 5}]},
    )

    await consumer._handlers[EventType.ORDER_CREATED](envelope)  # must not raise

    inv = await _get_inventory(session_factory)
    assert inv.available_quantity == 1  # unchanged
    assert _published_event_types(producer) == []


async def test_payment_completed_finalizes_sale(session_factory, redis):
    await _seed(session_factory)
    producer = AsyncMock()
    consumer = _consumer(redis, session_factory, producer)

    async with session_factory() as db:
        await InventoryRepository(db).reserve(1, 3, "order-1")

    envelope = make_event(
        event_type=EventType.PAYMENT_COMPLETED,
        producer="payment-service",
        partition_key="order-1",
        payload={"order_id": "order-1", "items": [{"product_id": 1, "quantity": 3}]},
    )
    await consumer._handlers[EventType.PAYMENT_COMPLETED](envelope)

    inv = await _get_inventory(session_factory)
    assert inv.reserved_quantity == 0
    assert inv.sold_quantity == 3
    assert EventType.STOCK_DEDUCTED in _published_event_types(producer)


async def test_order_confirmed_is_a_defensive_fallback_noop_after_payment_completed(session_factory, redis):
    """If PaymentCompleted already finalized the sale, a later OrderConfirmed
    must be a no-op (finalize_sale's own idempotency), not a double-deduct."""
    await _seed(session_factory)
    producer = AsyncMock()
    consumer = _consumer(redis, session_factory, producer)

    async with session_factory() as db:
        await InventoryRepository(db).reserve(1, 3, "order-1")
        await InventoryRepository(db).finalize_sale(1, "order-1")

    envelope = make_event(
        event_type=EventType.ORDER_CONFIRMED,
        producer="order-service",
        partition_key="order-1",
        payload={"order_id": "order-1", "items": [{"product_id": 1, "quantity": 3}]},
    )
    await consumer._handlers[EventType.ORDER_CONFIRMED](envelope)

    inv = await _get_inventory(session_factory)
    assert inv.sold_quantity == 3  # unchanged, not double-deducted
    assert _published_event_types(producer) == []  # no-op publishes nothing


async def test_order_cancelled_releases_reservation(session_factory, redis):
    await _seed(session_factory)
    producer = AsyncMock()
    consumer = _consumer(redis, session_factory, producer)

    async with session_factory() as db:
        await InventoryRepository(db).reserve(1, 3, "order-1")

    envelope = make_event(
        event_type=EventType.ORDER_CANCELLED,
        producer="order-service",
        partition_key="order-1",
        payload={"order_id": "order-1", "items": [{"product_id": 1, "quantity": 3}]},
    )
    await consumer._handlers[EventType.ORDER_CANCELLED](envelope)

    inv = await _get_inventory(session_factory)
    assert inv.available_quantity == 10
    assert inv.reserved_quantity == 0
    assert EventType.INVENTORY_RELEASED in _published_event_types(producer)


async def test_payment_failed_releases_reservation(session_factory, redis):
    await _seed(session_factory)
    producer = AsyncMock()
    consumer = _consumer(redis, session_factory, producer)

    async with session_factory() as db:
        await InventoryRepository(db).reserve(1, 3, "order-1")

    envelope = make_event(
        event_type=EventType.PAYMENT_FAILED,
        producer="payment-service",
        partition_key="order-1",
        payload={"order_id": "order-1", "items": [{"product_id": 1, "quantity": 3}]},
    )
    await consumer._handlers[EventType.PAYMENT_FAILED](envelope)

    inv = await _get_inventory(session_factory)
    assert inv.reserved_quantity == 0
    assert EventType.INVENTORY_RELEASED in _published_event_types(producer)


async def test_refund_completed_restocks(session_factory, redis):
    await _seed(session_factory, available=5)
    producer = AsyncMock()
    consumer = _consumer(redis, session_factory, producer)

    envelope = make_event(
        event_type=EventType.REFUND_COMPLETED,
        producer="payment-service",
        partition_key="order-1",
        payload={"order_id": "order-1", "items": [{"product_id": 1, "quantity": 2}]},
    )
    await consumer._handlers[EventType.REFUND_COMPLETED](envelope)

    inv = await _get_inventory(session_factory)
    assert inv.available_quantity == 7
    assert EventType.STOCK_RESTORED in _published_event_types(producer)


async def test_duplicate_event_id_is_skipped_via_redis_claim(session_factory, redis):
    """Exercises EventConsumer._process itself (not just the handler) to
    prove Kafka redelivery of the same event_id doesn't reprocess."""
    await _seed(session_factory)
    producer = AsyncMock()
    consumer = _consumer(redis, session_factory, producer)

    envelope = make_event(
        event_type=EventType.ORDER_CREATED,
        producer="order-service",
        partition_key="order-dup",
        payload={"order_id": "order-dup", "items": [{"product_id": 1, "quantity": 2}]},
    )
    msg = FakeMsg(envelope.model_dump_json())

    await consumer._process(msg)
    await consumer._process(msg)  # redelivered with the same event_id

    inv = await _get_inventory(session_factory)
    assert inv.reserved_quantity == 2  # not double-reserved
