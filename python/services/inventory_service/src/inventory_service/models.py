from enum import StrEnum

from ecom_common.db import Base, TimestampMixin
from sqlalchemy import CheckConstraint, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column


class InventoryStatus(StrEnum):
    IN_STOCK = "IN_STOCK"
    LOW_STOCK = "LOW_STOCK"
    OUT_OF_STOCK = "OUT_OF_STOCK"


class ReservationStatus(StrEnum):
    RESERVED = "RESERVED"
    RELEASED = "RELEASED"
    DEDUCTED = "DEDUCTED"


class Inventory(Base, TimestampMixin):
    """Stock ledger for a product. One row per product (single warehouse per
    product in v1 — `warehouse_location` is tracked but not yet part of the
    uniqueness key; multi-warehouse would re-key lookups to (product_id,
    warehouse_location))."""

    __tablename__ = "inventory"
    __table_args__ = (
        CheckConstraint("available_quantity >= 0", name="ck_inventory_available_nonneg"),
        CheckConstraint("reserved_quantity >= 0", name="ck_inventory_reserved_nonneg"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # No DB-level FK: product_id references a row in product_service's own
    # database (a different Postgres database entirely under the per-service-DB
    # pattern), so referential integrity is enforced at the application layer only.
    product_id: Mapped[int] = mapped_column(Integer, unique=True, index=True, nullable=False)
    sku: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    warehouse_location: Mapped[str] = mapped_column(String(120), nullable=False, default="DEFAULT")

    available_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reserved_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sold_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    safety_stock: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reorder_threshold: Mapped[int] = mapped_column(Integer, nullable=False, default=10)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default=InventoryStatus.OUT_OF_STOCK)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class InventoryReservation(Base, TimestampMixin):
    """Idempotency + audit ledger for reserve/release/deduct operations.

    `UniqueConstraint(product_id, order_id)` is the business-level idempotency
    key: a retried reserve call for the same order_id is a no-op instead of a
    double-decrement. This is independent from (and complementary to) the Kafka
    consumer's own event_id-based dedup, which only protects against redelivery
    of the *same* envelope, not a distinct-event_id producer retry or a direct
    REST client retry.
    """

    __tablename__ = "inventory_reservations"
    __table_args__ = (UniqueConstraint("product_id", "order_id", name="uq_inventory_reservation_product_order"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    order_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=ReservationStatus.RESERVED, index=True)


def status_for(available_quantity: int, reorder_threshold: int) -> InventoryStatus:
    """Pure classification used to keep `Inventory.status` in sync after every
    quantity mutation, and to detect edge transitions for event publishing."""
    if available_quantity <= 0:
        return InventoryStatus.OUT_OF_STOCK
    if available_quantity <= reorder_threshold:
        return InventoryStatus.LOW_STOCK
    return InventoryStatus.IN_STOCK
