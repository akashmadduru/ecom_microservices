import uuid
from datetime import UTC, datetime
from typing import Any

import structlog
from pydantic import BaseModel, Field


class Topics:
    """One topic per aggregate; the envelope's event_type discriminates.

    Partitioning by aggregate id preserves per-entity ordering.
    """

    USER = "user.events"
    PRODUCT = "product.events"
    INVENTORY = "inventory.events"
    CART = "cart.events"
    WISHLIST = "wishlist.events"
    ORDER = "order.events"
    PAYMENT = "payment.events"
    REVIEW = "review.events"
    NOTIFICATION = "notification.events"

    @staticmethod
    def dlq(topic: str) -> str:
        return f"{topic}.dlq"


class EventType:
    USER_CREATED = "UserCreated"
    USER_UPDATED = "UserUpdated"
    PRODUCT_CREATED = "ProductCreated"
    PRODUCT_UPDATED = "ProductUpdated"
    PRODUCT_DELETED = "ProductDeleted"
    INVENTORY_CREATED = "InventoryCreated"
    INVENTORY_RESERVED = "InventoryReserved"
    INVENTORY_RELEASED = "InventoryReleased"
    INVENTORY_UPDATED = "InventoryUpdated"
    STOCK_DEDUCTED = "StockDeducted"
    STOCK_RESTORED = "StockRestored"
    LOW_STOCK_DETECTED = "LowStockDetected"
    OUT_OF_STOCK_DETECTED = "OutOfStockDetected"
    CART_CREATED = "CartCreated"
    CART_UPDATED = "CartUpdated"
    WISHLIST_UPDATED = "WishlistUpdated"
    ORDER_CREATED = "OrderCreated"
    ORDER_CONFIRMED = "OrderConfirmed"
    ORDER_FAILED = "OrderFailed"
    ORDER_CANCELLED = "OrderCancelled"
    PAYMENT_STARTED = "PaymentStarted"
    PAYMENT_COMPLETED = "PaymentCompleted"
    PAYMENT_FAILED = "PaymentFailed"
    REFUND_INITIATED = "RefundInitiated"
    REFUND_COMPLETED = "RefundCompleted"
    NOTIFICATION_REQUESTED = "NotificationRequested"
    NOTIFICATION_SENT = "NotificationSent"
    REVIEW_CREATED = "ReviewCreated"
    REVIEW_UPDATED = "ReviewUpdated"
    REVIEW_DELETED = "ReviewDeleted"


class EventEnvelope(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    event_type: str
    event_version: int = 1
    occurred_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    producer: str
    correlation_id: str | None = None
    partition_key: str
    payload: dict[str, Any]


def make_event(*, event_type: str, producer: str, partition_key: str, payload: dict[str, Any], version: int = 1) -> EventEnvelope:
    """Build an envelope, propagating the correlation id from the log context."""
    ctx = structlog.contextvars.get_contextvars()
    return EventEnvelope(
        event_type=event_type,
        event_version=version,
        producer=producer,
        correlation_id=ctx.get("correlation_id"),
        partition_key=partition_key,
        payload=payload,
    )
