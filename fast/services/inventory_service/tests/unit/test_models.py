import pytest
from inventory_service.models import Inventory, InventoryStatus, status_for
from sqlalchemy.exc import IntegrityError


async def test_available_quantity_check_constraint(db):
    db.add(Inventory(product_id=1, sku="SKU-1", available_quantity=-1))
    with pytest.raises(IntegrityError):
        await db.commit()


async def test_reserved_quantity_check_constraint(db):
    db.add(Inventory(product_id=2, sku="SKU-2", available_quantity=5, reserved_quantity=-1))
    with pytest.raises(IntegrityError):
        await db.commit()


@pytest.mark.parametrize(
    ("available", "threshold", "expected"),
    [
        (0, 10, InventoryStatus.OUT_OF_STOCK),
        (10, 10, InventoryStatus.LOW_STOCK),
        (11, 10, InventoryStatus.IN_STOCK),
        (5, 10, InventoryStatus.LOW_STOCK),
        (1, 0, InventoryStatus.IN_STOCK),
        (0, 0, InventoryStatus.OUT_OF_STOCK),
    ],
)
def test_status_for_boundaries(available, threshold, expected):
    assert status_for(available, threshold) == expected
