import pytest
from ecom_common.errors import ConflictError, DomainValidationError, NotFoundError
from inventory_service.repo import InventoryRepository


async def _seeded(db, available=10, reorder_threshold=5):
    repo = InventoryRepository(db)
    inv = await repo.create_inventory(product_id=1, sku="SKU-1", available_quantity=available, reorder_threshold=reorder_threshold)
    return repo, inv


async def test_reserve_reduces_available_increases_reserved(db):
    repo, inv = await _seeded(db)
    result = await repo.reserve(inv.product_id, 3, "order-1")
    assert result.changed
    assert result.inventory.available_quantity == 7
    assert result.inventory.reserved_quantity == 3


async def test_reserve_beyond_available_raises_conflict(db):
    repo, inv = await _seeded(db, available=2)
    with pytest.raises(ConflictError):
        await repo.reserve(inv.product_id, 5, "order-1")


async def test_reserve_missing_inventory_raises_not_found(db):
    repo = InventoryRepository(db)
    with pytest.raises(NotFoundError):
        await repo.reserve(999, 1, "order-1")


async def test_reserve_is_idempotent_per_order_id(db):
    """Duplicate order_id must not double-decrement — the ledger's
    (product_id, order_id) unique constraint is the idempotency key."""
    repo, inv = await _seeded(db)
    r1 = await repo.reserve(inv.product_id, 3, "order-1")
    r2 = await repo.reserve(inv.product_id, 3, "order-1")
    assert r1.changed
    assert not r2.changed
    assert r2.inventory.available_quantity == 7


async def test_release_returns_stock(db):
    repo, inv = await _seeded(db)
    await repo.reserve(inv.product_id, 3, "order-1")
    result = await repo.release(inv.product_id, "order-1")
    assert result.changed
    assert result.inventory.available_quantity == 10
    assert result.inventory.reserved_quantity == 0


async def test_release_without_reservation_raises_not_found(db):
    repo, inv = await _seeded(db)
    with pytest.raises(NotFoundError):
        await repo.release(inv.product_id, "no-such-order")


async def test_release_is_idempotent(db):
    repo, inv = await _seeded(db)
    await repo.reserve(inv.product_id, 3, "order-1")
    r1 = await repo.release(inv.product_id, "order-1")
    r2 = await repo.release(inv.product_id, "order-1")
    assert r1.changed
    assert not r2.changed


async def test_finalize_sale_moves_reserved_to_sold(db):
    repo, inv = await _seeded(db)
    await repo.reserve(inv.product_id, 3, "order-1")
    result = await repo.finalize_sale(inv.product_id, "order-1")
    assert result.changed
    assert result.inventory.reserved_quantity == 0
    assert result.inventory.sold_quantity == 3


async def test_finalize_sale_is_idempotent(db):
    repo, inv = await _seeded(db)
    await repo.reserve(inv.product_id, 3, "order-1")
    r1 = await repo.finalize_sale(inv.product_id, "order-1")
    r2 = await repo.finalize_sale(inv.product_id, "order-1")
    assert r1.changed
    assert not r2.changed


async def test_finalize_sale_after_release_raises_conflict(db):
    repo, inv = await _seeded(db)
    await repo.reserve(inv.product_id, 3, "order-1")
    await repo.release(inv.product_id, "order-1")
    with pytest.raises(ConflictError):
        await repo.finalize_sale(inv.product_id, "order-1")


async def test_finalize_sale_without_reservation_raises_not_found(db):
    repo, inv = await _seeded(db)
    with pytest.raises(NotFoundError):
        await repo.finalize_sale(inv.product_id, "no-such-order")


async def test_restock_increases_available(db):
    repo, inv = await _seeded(db)
    result = await repo.restock(inv.product_id, 5)
    assert result.inventory.available_quantity == 15


async def test_restock_missing_inventory_raises_not_found(db):
    repo = InventoryRepository(db)
    with pytest.raises(NotFoundError):
        await repo.restock(999, 5)


async def test_adjust_negative_delta(db):
    repo, inv = await _seeded(db)
    result = await repo.adjust(inv.product_id, -3, "stocktake correction")
    assert result.inventory.available_quantity == 7


async def test_adjust_positive_delta(db):
    repo, inv = await _seeded(db)
    result = await repo.adjust(inv.product_id, 5, "found extra stock")
    assert result.inventory.available_quantity == 15


async def test_adjust_below_zero_raises_domain_validation(db):
    repo, inv = await _seeded(db, available=2)
    with pytest.raises(DomainValidationError):
        await repo.adjust(inv.product_id, -5, "too much")


async def test_status_transitions_on_reserve(db):
    repo, inv = await _seeded(db, available=6, reorder_threshold=5)
    assert inv.status == "IN_STOCK"
    result = await repo.reserve(inv.product_id, 5, "order-1")  # leaves 1 available <= threshold
    assert result.old_status == "IN_STOCK"
    assert result.new_status == "LOW_STOCK"


async def test_status_transitions_to_out_of_stock(db):
    repo, inv = await _seeded(db, available=3, reorder_threshold=5)
    result = await repo.reserve(inv.product_id, 3, "order-1")
    assert result.new_status == "OUT_OF_STOCK"


async def test_update_metadata_optimistic_lock_success(db):
    repo, inv = await _seeded(db)
    updated = await repo.update_metadata(inv, expected_version=1, reorder_threshold=25)
    assert updated.reorder_threshold == 25
    assert updated.version == 2


async def test_update_metadata_stale_version_conflicts(db):
    from ecom_common.errors import ConflictError as CE

    repo, inv = await _seeded(db)
    await repo.update_metadata(inv, expected_version=1, reorder_threshold=25)
    with pytest.raises(CE):
        await repo.update_metadata(inv, expected_version=1, reorder_threshold=30)


async def test_health_report_aggregates(db):
    repo = InventoryRepository(db)
    await repo.create_inventory(product_id=1, sku="SKU-1", available_quantity=100, reorder_threshold=10)  # IN_STOCK
    await repo.create_inventory(product_id=2, sku="SKU-2", available_quantity=5, reorder_threshold=10)  # LOW_STOCK
    await repo.create_inventory(product_id=3, sku="SKU-3", available_quantity=0, reorder_threshold=10)  # OUT_OF_STOCK

    report = await repo.health_report()
    assert report["total_skus"] == 3
    assert report["in_stock_count"] == 1
    assert report["low_stock_count"] == 1
    assert report["out_of_stock_count"] == 1
    assert report["total_available_quantity"] == 105
    assert report["total_reserved_quantity"] == 0
