"""Kafka consumer wiring: reacts to Order/Payment events to keep the stock
ledger in sync. This is the first real `EventConsumer` usage in the codebase
(auth_service/product_service only publish) — there is no live Order/Payment
producer yet, so the payload contract below (`{"order_id": str, "items": [{"product_id": int, "quantity": int}, ...]}`)
is a judgment call the eventual Order Service should confirm.

Event -> action -> published event, per the design doc:
  OrderCreated      -> reserve()       -> InventoryReserved (+ Low/OutOfStock on edge transition)
  PaymentCompleted   -> finalize_sale() -> StockDeducted (+ Low/OutOfStock on edge transition)   [canonical finalize trigger]
  OrderConfirmed     -> finalize_sale() -> same, defensive fallback for COD-style flows where
                                            confirmation may precede payment capture
  OrderCancelled     -> release()      -> InventoryReleased
  PaymentFailed       -> release()      -> InventoryReleased
  RefundCompleted    -> restock()      -> StockRestored

Business-level idempotency is provided by `InventoryReservation`'s
(product_id, order_id) unique constraint; infra-level dedup of redelivered
envelopes is provided by `EventConsumer`'s own Redis event_id claim.
"""

from collections.abc import Awaitable, Callable

from ecom_common.errors import ConflictError, NotFoundError
from ecom_common.events import EventEnvelope, EventType, Topics, make_event
from ecom_common.kafka import EventConsumer, EventProducer
from ecom_common.logging import get_logger
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import async_sessionmaker

from inventory_service.config import get_settings
from inventory_service.models import Inventory, InventoryStatus
from inventory_service.repo import InventoryRepository, StockMutationResult

log = get_logger("inventory.consumers")

RepoAction = Callable[[InventoryRepository, int, int, str], Awaitable[StockMutationResult]]

CONSUMER_GROUP_ID = "inventory-service"


async def _publish(producer: EventProducer, event_type: str, inventory: Inventory) -> None:
    try:
        await producer.publish(
            Topics.INVENTORY,
            make_event(
                event_type=event_type,
                producer=get_settings().service_name,
                partition_key=str(inventory.product_id),
                payload={
                    "inventory_id": inventory.id,
                    "product_id": inventory.product_id,
                    "sku": inventory.sku,
                    "available_quantity": inventory.available_quantity,
                    "reserved_quantity": inventory.reserved_quantity,
                    "sold_quantity": inventory.sold_quantity,
                    "status": inventory.status,
                },
            ),
        )
    except Exception:
        log.exception("inventory_event_publish_failed", event_type=event_type)


async def _publish_transition(producer: EventProducer, result: StockMutationResult) -> None:
    if result.old_status == result.new_status:
        return
    if result.new_status == InventoryStatus.OUT_OF_STOCK:
        await _publish(producer, EventType.OUT_OF_STOCK_DETECTED, result.inventory)
    elif result.new_status == InventoryStatus.LOW_STOCK and result.old_status == InventoryStatus.IN_STOCK:
        await _publish(producer, EventType.LOW_STOCK_DETECTED, result.inventory)


async def _for_each_item(
    session_factory: async_sessionmaker,
    producer: EventProducer,
    envelope: EventEnvelope,
    action: RepoAction,
    on_success_event_type: str | None,
) -> None:
    order_id = envelope.payload.get("order_id")
    items = envelope.payload.get("items", [])
    if not order_id or not items:
        log.warning("inventory_event_missing_fields", event_type=envelope.event_type, event_id=envelope.event_id)
        return

    async with session_factory() as db:
        repo = InventoryRepository(db)
        for item in items:
            product_id, quantity = item.get("product_id"), item.get("quantity")
            if not product_id or not quantity:
                continue
            try:
                result = await action(repo, product_id, quantity, order_id)
            except NotFoundError:
                log.warning("inventory_event_product_not_found", product_id=product_id, order_id=order_id, event_type=envelope.event_type)
                continue
            except ConflictError as exc:
                # e.g. insufficient stock on OrderCreated — no rejection event is
                # published today since no consumer exists yet to react to one.
                log.warning(
                    "inventory_event_conflict", product_id=product_id, order_id=order_id, event_type=envelope.event_type, error=str(exc)
                )
                continue

            if result.changed:
                if on_success_event_type:
                    await _publish(producer, on_success_event_type, result.inventory)
                await _publish_transition(producer, result)


def build_consumer(*, bootstrap_servers: str, redis: Redis, producer: EventProducer, session_factory: async_sessionmaker) -> EventConsumer:
    consumer = EventConsumer(
        bootstrap_servers=bootstrap_servers,
        group_id=CONSUMER_GROUP_ID,
        topics=[Topics.ORDER, Topics.PAYMENT],
        redis=redis,
        producer=producer,
    )

    async def _reserve(repo: InventoryRepository, product_id: int, quantity: int, order_id: str) -> StockMutationResult:
        return await repo.reserve(product_id, quantity, order_id)

    async def _finalize(repo: InventoryRepository, product_id: int, quantity: int, order_id: str) -> StockMutationResult:  # noqa: ARG001
        return await repo.finalize_sale(product_id, order_id)

    async def _release(repo: InventoryRepository, product_id: int, quantity: int, order_id: str) -> StockMutationResult:  # noqa: ARG001
        return await repo.release(product_id, order_id)

    async def _restock(repo: InventoryRepository, product_id: int, quantity: int, order_id: str) -> StockMutationResult:  # noqa: ARG001
        return await repo.restock(product_id, quantity)

    async def handle_order_created(envelope: EventEnvelope) -> None:
        await _for_each_item(session_factory, producer, envelope, _reserve, EventType.INVENTORY_RESERVED)

    async def handle_payment_completed(envelope: EventEnvelope) -> None:
        await _for_each_item(session_factory, producer, envelope, _finalize, EventType.STOCK_DEDUCTED)

    async def handle_order_confirmed(envelope: EventEnvelope) -> None:
        # Defensive fallback: no-op via finalize_sale's own idempotency if
        # PaymentCompleted already handled it.
        await _for_each_item(session_factory, producer, envelope, _finalize, EventType.STOCK_DEDUCTED)

    async def handle_order_cancelled(envelope: EventEnvelope) -> None:
        await _for_each_item(session_factory, producer, envelope, _release, EventType.INVENTORY_RELEASED)

    async def handle_payment_failed(envelope: EventEnvelope) -> None:
        await _for_each_item(session_factory, producer, envelope, _release, EventType.INVENTORY_RELEASED)

    async def handle_refund_completed(envelope: EventEnvelope) -> None:
        await _for_each_item(session_factory, producer, envelope, _restock, EventType.STOCK_RESTORED)

    consumer.on(EventType.ORDER_CREATED, handle_order_created)
    consumer.on(EventType.PAYMENT_COMPLETED, handle_payment_completed)
    consumer.on(EventType.ORDER_CONFIRMED, handle_order_confirmed)
    consumer.on(EventType.ORDER_CANCELLED, handle_order_cancelled)
    consumer.on(EventType.PAYMENT_FAILED, handle_payment_failed)
    consumer.on(EventType.REFUND_COMPLETED, handle_refund_completed)
    return consumer
