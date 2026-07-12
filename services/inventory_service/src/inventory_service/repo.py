from dataclasses import dataclass

from ecom_common.errors import ConflictError, DomainValidationError, NotFoundError
from ecom_common.pagination import PageParams, Pagination, paginate
from ecom_common.repository import BaseRepository
from sqlalchemy import Select, case, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from inventory_service.models import Inventory, InventoryReservation, InventoryStatus, ReservationStatus, status_for


@dataclass
class StockMutationResult:
    inventory: Inventory
    old_status: str
    new_status: str
    changed: bool  # False when the operation was an idempotent no-op


class InventoryRepository(BaseRepository[Inventory]):
    model = Inventory

    async def create_inventory(self, **fields) -> Inventory:
        # Column defaults (available_quantity=0, reorder_threshold=10, ...) only
        # apply at INSERT time, not on plain construction — set them here too so
        # status_for() below always sees ints, not None, before the first flush.
        fields.setdefault("warehouse_location", "DEFAULT")
        fields.setdefault("available_quantity", 0)
        fields.setdefault("reserved_quantity", 0)
        fields.setdefault("sold_quantity", 0)
        fields.setdefault("safety_stock", 0)
        fields.setdefault("reorder_threshold", 10)
        fields.setdefault("version", 1)

        inventory = Inventory(**fields)
        inventory.status = status_for(inventory.available_quantity, inventory.reorder_threshold)
        self.db.add(inventory)
        try:
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise ConflictError("Inventory already exists for this product_id/sku") from exc
        await self.db.refresh(inventory)
        return inventory

    async def get_by_product(self, product_id: int) -> Inventory | None:
        return await self.get_by(product_id=product_id)

    async def get_for_update(self, product_id: int) -> Inventory | None:
        stmt = select(Inventory).where(Inventory.product_id == product_id).with_for_update()
        return (await self.db.execute(stmt)).scalars().first()

    def build_list_query(self, *, status: str | None = None, warehouse_location: str | None = None) -> Select:
        stmt = select(Inventory)
        if status:
            stmt = stmt.filter(Inventory.status == status)
        if warehouse_location:
            stmt = stmt.filter(Inventory.warehouse_location == warehouse_location)
        return stmt.order_by(Inventory.id)

    async def list_paginated(
        self, params: PageParams, *, status: str | None = None, warehouse_location: str | None = None
    ) -> tuple[list[Inventory], Pagination]:
        stmt = self.build_list_query(status=status, warehouse_location=warehouse_location)
        return await paginate(self.db, stmt, params)

    async def update_metadata(self, inventory: Inventory, *, expected_version: int, **fields) -> Inventory:
        """Optimistic-lock metadata update — low-contention path, no row lock held."""
        values = {k: v for k, v in fields.items() if v is not None}
        values["version"] = Inventory.version + 1
        stmt = update(Inventory).where(Inventory.id == inventory.id, Inventory.version == expected_version).values(**values)
        result = await self.db.execute(stmt)
        if result.rowcount == 0:
            await self.db.rollback()
            raise ConflictError("Inventory was modified by another request; refetch and retry")
        await self.db.commit()
        await self.db.refresh(inventory)
        return inventory

    async def _get_reservation(self, product_id: int, order_id: str) -> InventoryReservation | None:
        stmt = select(InventoryReservation).where(
            InventoryReservation.product_id == product_id, InventoryReservation.order_id == order_id
        )
        return (await self.db.execute(stmt)).scalars().first()

    async def reserve(self, product_id: int, quantity: int, order_id: str) -> StockMutationResult:
        existing = await self._get_reservation(product_id, order_id)
        if existing is not None:
            inventory = await self.get_by_product(product_id)
            return StockMutationResult(inventory, inventory.status, inventory.status, changed=False)

        inventory = await self.get_for_update(product_id)
        if inventory is None:
            raise NotFoundError("Inventory not found for product")
        if inventory.available_quantity < quantity:
            raise ConflictError("Insufficient available stock to reserve")

        old_status = inventory.status
        inventory.available_quantity -= quantity
        inventory.reserved_quantity += quantity
        inventory.status = status_for(inventory.available_quantity, inventory.reorder_threshold)

        self.db.add(InventoryReservation(product_id=product_id, order_id=order_id, quantity=quantity, status=ReservationStatus.RESERVED))
        await self.db.commit()
        await self.db.refresh(inventory)
        return StockMutationResult(inventory, old_status, inventory.status, changed=True)

    async def release(self, product_id: int, order_id: str) -> StockMutationResult:
        reservation = await self._get_reservation(product_id, order_id)
        if reservation is None:
            raise NotFoundError("No reservation found for this product/order")
        if reservation.status != ReservationStatus.RESERVED:
            # Already released or finalized — idempotent no-op.
            inventory = await self.get_by_product(product_id)
            return StockMutationResult(inventory, inventory.status, inventory.status, changed=False)

        inventory = await self.get_for_update(product_id)
        old_status = inventory.status
        inventory.reserved_quantity -= reservation.quantity
        inventory.available_quantity += reservation.quantity
        inventory.status = status_for(inventory.available_quantity, inventory.reorder_threshold)
        reservation.status = ReservationStatus.RELEASED

        await self.db.commit()
        await self.db.refresh(inventory)
        return StockMutationResult(inventory, old_status, inventory.status, changed=True)

    async def finalize_sale(self, product_id: int, order_id: str) -> StockMutationResult:
        """Commit a reservation to a completed sale (reserved -> sold)."""
        reservation = await self._get_reservation(product_id, order_id)
        if reservation is None:
            raise NotFoundError("No reservation found for this product/order")
        if reservation.status == ReservationStatus.DEDUCTED:
            inventory = await self.get_by_product(product_id)
            return StockMutationResult(inventory, inventory.status, inventory.status, changed=False)
        if reservation.status != ReservationStatus.RESERVED:
            raise ConflictError("Reservation was already released; cannot finalize a released reservation")

        inventory = await self.get_for_update(product_id)
        old_status = inventory.status
        inventory.reserved_quantity -= reservation.quantity
        inventory.sold_quantity += reservation.quantity
        inventory.status = status_for(inventory.available_quantity, inventory.reorder_threshold)
        reservation.status = ReservationStatus.DEDUCTED

        await self.db.commit()
        await self.db.refresh(inventory)
        return StockMutationResult(inventory, old_status, inventory.status, changed=True)

    async def restock(self, product_id: int, quantity: int) -> StockMutationResult:
        inventory = await self.get_for_update(product_id)
        if inventory is None:
            raise NotFoundError("Inventory not found for product")

        old_status = inventory.status
        inventory.available_quantity += quantity
        inventory.status = status_for(inventory.available_quantity, inventory.reorder_threshold)

        await self.db.commit()
        await self.db.refresh(inventory)
        return StockMutationResult(inventory, old_status, inventory.status, changed=True)

    async def adjust(self, product_id: int, delta: int, reason: str) -> StockMutationResult:  # noqa: ARG002 — reason logged by caller
        inventory = await self.get_for_update(product_id)
        if inventory is None:
            raise NotFoundError("Inventory not found for product")

        new_available = inventory.available_quantity + delta
        if new_available < 0:
            raise DomainValidationError("Adjustment would result in negative available stock")

        old_status = inventory.status
        inventory.available_quantity = new_available
        inventory.status = status_for(inventory.available_quantity, inventory.reorder_threshold)

        await self.db.commit()
        await self.db.refresh(inventory)
        return StockMutationResult(inventory, old_status, inventory.status, changed=True)

    async def health_report(self) -> dict:
        stmt = select(
            func.count(Inventory.id),
            func.coalesce(func.sum(case((Inventory.status == InventoryStatus.IN_STOCK, 1), else_=0)), 0),
            func.coalesce(func.sum(case((Inventory.status == InventoryStatus.LOW_STOCK, 1), else_=0)), 0),
            func.coalesce(func.sum(case((Inventory.status == InventoryStatus.OUT_OF_STOCK, 1), else_=0)), 0),
            func.coalesce(func.sum(Inventory.available_quantity), 0),
            func.coalesce(func.sum(Inventory.reserved_quantity), 0),
        )
        total, in_stock, low_stock, out_of_stock, total_available, total_reserved = (await self.db.execute(stmt)).one()
        return {
            "total_skus": total,
            "in_stock_count": in_stock,
            "low_stock_count": low_stock,
            "out_of_stock_count": out_of_stock,
            "total_available_quantity": total_available,
            "total_reserved_quantity": total_reserved,
        }


def get_repo(db: AsyncSession) -> InventoryRepository:
    return InventoryRepository(db)
