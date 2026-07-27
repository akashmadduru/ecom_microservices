import pytest
from ecom_common.errors import ConflictError
from ecom_common.pagination import PageParams
from inventory_service.repo import InventoryRepository


async def test_create_and_get(db):
    repo = InventoryRepository(db)
    inv = await repo.create_inventory(product_id=1, sku="SKU-1", available_quantity=10, reorder_threshold=5)
    assert inv.id is not None
    assert inv.status == "IN_STOCK"

    fetched = await repo.get_by_product(1)
    assert fetched is not None
    assert fetched.sku == "SKU-1"


async def test_get_by_product_missing_returns_none(db):
    repo = InventoryRepository(db)
    assert await repo.get_by_product(999) is None


async def test_create_duplicate_product_conflicts(db):
    repo = InventoryRepository(db)
    await repo.create_inventory(product_id=1, sku="SKU-1", available_quantity=10)
    with pytest.raises(ConflictError):
        await repo.create_inventory(product_id=1, sku="SKU-2", available_quantity=5)


async def test_create_duplicate_sku_conflicts(db):
    repo = InventoryRepository(db)
    await repo.create_inventory(product_id=1, sku="SKU-1", available_quantity=10)
    with pytest.raises(ConflictError):
        await repo.create_inventory(product_id=2, sku="SKU-1", available_quantity=5)


async def test_list_paginated(db):
    repo = InventoryRepository(db)
    for i in range(1, 4):
        await repo.create_inventory(product_id=i, sku=f"SKU-{i}", available_quantity=10)

    items, pagination = await repo.list_paginated(PageParams(page=1, page_size=20))
    assert len(items) == 3
    assert pagination.total_items == 3


async def test_list_paginated_filters_by_status(db):
    repo = InventoryRepository(db)
    await repo.create_inventory(product_id=1, sku="SKU-1", available_quantity=0)
    await repo.create_inventory(product_id=2, sku="SKU-2", available_quantity=100)

    items, pagination = await repo.list_paginated(PageParams(page=1, page_size=20), status="OUT_OF_STOCK")
    assert pagination.total_items == 1
    assert items[0].product_id == 1
