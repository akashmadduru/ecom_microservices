from ecom_common.auth import Role, TokenPayload, require_roles
from ecom_common.errors import NotFoundError
from ecom_common.events import EventType, Topics, make_event
from ecom_common.logging import get_logger
from ecom_common.pagination import PageParams
from ecom_common.redis import cache_get_json, cache_set_json
from fastapi import APIRouter, Depends, Query, Request, status

from inventory_service.config import get_settings
from inventory_service.deps import DbDep, RedisDep, get_current_user
from inventory_service.models import Inventory, InventoryStatus
from inventory_service.repo import InventoryRepository, StockMutationResult
from inventory_service.schemas import (
    AdjustStockRequest,
    BulkInventoryResult,
    BulkInventoryUpdate,
    HealthReportResponse,
    InventoryCreate,
    InventoryPage,
    InventoryResponse,
    InventoryUpdate,
    ReleaseStockRequest,
    ReserveStockRequest,
    RestockRequest,
)

log = get_logger("inventory.routes")

router = APIRouter(prefix="/inventory", tags=["inventory"])
admin_router = APIRouter(prefix="/admin/inventory", tags=["admin"])
internal_router = APIRouter(prefix="/internal", tags=["internal"], include_in_schema=False)

require_seller = require_roles(get_current_user, Role.SELLER)
require_admin = require_roles(get_current_user, Role.ADMIN)

CACHE_PREFIX = "cache:inventory:"
HEALTH_REPORT_CACHE_KEY = "cache:inventory:health-report"


async def publish_inventory_event(request: Request, event_type: str, inventory: Inventory) -> None:
    producer = getattr(request.app.state, "producer", None)
    if producer is None:
        return
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
        # Stock writes must not fail because the broker is down; consumers reconcile via backfill.
        log.exception("inventory_event_publish_failed", event_type=event_type)


async def publish_status_transition_events(request: Request, result: StockMutationResult) -> None:
    """Edge-triggered low/out-of-stock alerts: fire only on the transition into
    a worse state, not on every subsequent write while already in it."""
    if result.old_status == result.new_status:
        return
    if result.new_status == InventoryStatus.OUT_OF_STOCK:
        await publish_inventory_event(request, EventType.OUT_OF_STOCK_DETECTED, result.inventory)
    elif result.new_status == InventoryStatus.LOW_STOCK and result.old_status == InventoryStatus.IN_STOCK:
        await publish_inventory_event(request, EventType.LOW_STOCK_DETECTED, result.inventory)


async def _invalidate_cache(redis, product_id: int) -> None:
    await redis.delete(f"{CACHE_PREFIX}{product_id}")


# --- Reports: must be declared before /{product_id} so FastAPI doesn't try to
# parse "reports" as an int product_id. ---


@router.get(
    "/reports/low-stock",
    response_model=InventoryPage,
    summary="List low-stock products",
    description="Products whose available quantity has fallen to or below their reorder threshold.",
)
async def low_stock_products(db: DbDep, user: TokenPayload = Depends(require_seller), params: PageParams = Depends()):
    repo = InventoryRepository(db)
    items, pagination = await repo.list_paginated(params, status=InventoryStatus.LOW_STOCK)
    return InventoryPage(items=[InventoryResponse.model_validate(i) for i in items], pagination=pagination)


@router.get(
    "/reports/out-of-stock",
    response_model=InventoryPage,
    summary="List out-of-stock products",
    description="Products with zero available quantity.",
)
async def out_of_stock_products(db: DbDep, user: TokenPayload = Depends(require_seller), params: PageParams = Depends()):
    repo = InventoryRepository(db)
    items, pagination = await repo.list_paginated(params, status=InventoryStatus.OUT_OF_STOCK)
    return InventoryPage(items=[InventoryResponse.model_validate(i) for i in items], pagination=pagination)


@router.get(
    "",
    response_model=InventoryPage,
    summary="List inventory",
    description="Paginated inventory list, filterable by status/warehouse.",
)
async def list_inventory(
    db: DbDep,
    params: PageParams = Depends(),
    status_filter: str | None = Query(None, alias="status", description="One of IN_STOCK, LOW_STOCK, OUT_OF_STOCK"),
    warehouse_location: str | None = Query(None, description="Exact warehouse location match"),
):
    repo = InventoryRepository(db)
    items, pagination = await repo.list_paginated(params, status=status_filter, warehouse_location=warehouse_location)
    return InventoryPage(items=[InventoryResponse.model_validate(i) for i in items], pagination=pagination)


@router.get(
    "/{product_id}",
    response_model=InventoryResponse,
    summary="Get inventory by product",
    responses={404: {"description": "No inventory row for this product_id"}},
)
async def get_inventory(product_id: int, db: DbDep, redis: RedisDep):
    cache_key = f"{CACHE_PREFIX}{product_id}"
    if cached := await cache_get_json(redis, cache_key):
        return cached

    inventory = await InventoryRepository(db).get_by_product(product_id)
    if inventory is None:
        raise NotFoundError("Inventory not found for product")
    response = InventoryResponse.model_validate(inventory)
    await cache_set_json(redis, cache_key, response.model_dump(mode="json"), get_settings().inventory_cache_ttl_seconds)
    return response


@router.post(
    "",
    response_model=InventoryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create inventory",
    description="Creates the stock ledger row for a product. Requires SELLER or ADMIN role.",
    responses={409: {"description": "Inventory already exists for this product_id/sku"}},
)
async def create_inventory(request: Request, payload: InventoryCreate, db: DbDep, user: TokenPayload = Depends(require_seller)):
    inventory = await InventoryRepository(db).create_inventory(**payload.model_dump())
    await publish_inventory_event(request, EventType.INVENTORY_CREATED, inventory)
    return InventoryResponse.model_validate(inventory)


@router.put(
    "/{product_id}",
    response_model=InventoryResponse,
    summary="Update inventory metadata",
    description="Updates sku/warehouse/thresholds only (not quantities). Optimistic-locked via `version`.",
    responses={404: {"description": "Not found"}, 409: {"description": "Stale version — refetch and retry"}},
)
async def update_inventory(
    request: Request, product_id: int, payload: InventoryUpdate, db: DbDep, redis: RedisDep, user: TokenPayload = Depends(require_seller)
):
    repo = InventoryRepository(db)
    inventory = await repo.get_by_product(product_id)
    if inventory is None:
        raise NotFoundError("Inventory not found for product")

    fields = payload.model_dump(exclude={"version"}, exclude_unset=True)
    inventory = await repo.update_metadata(inventory, expected_version=payload.version, **fields)
    await _invalidate_cache(redis, product_id)
    await publish_inventory_event(request, EventType.INVENTORY_UPDATED, inventory)
    return InventoryResponse.model_validate(inventory)


@router.post(
    "/{product_id}/reserve",
    response_model=InventoryResponse,
    summary="Reserve stock",
    description="Manual/ops reservation override. The primary automatic path is the OrderCreated Kafka consumer; "
    "this REST endpoint is for manual ops and QA. Idempotent per order_id.",
    responses={404: {"description": "Not found"}, 409: {"description": "Insufficient available stock"}},
)
async def reserve_stock(
    request: Request,
    product_id: int,
    payload: ReserveStockRequest,
    db: DbDep,
    redis: RedisDep,
    user: TokenPayload = Depends(require_seller),
):
    repo = InventoryRepository(db)
    result = await repo.reserve(product_id, payload.quantity, payload.order_id)
    if result.changed:
        await _invalidate_cache(redis, product_id)
        await publish_inventory_event(request, EventType.INVENTORY_RESERVED, result.inventory)
        await publish_status_transition_events(request, result)
    return InventoryResponse.model_validate(result.inventory)


@router.post(
    "/{product_id}/release",
    response_model=InventoryResponse,
    summary="Release reserved stock",
    description="Returns a reservation's quantity to available stock. Idempotent no-op if already released.",
    responses={404: {"description": "No reservation found for this product/order"}},
)
async def release_stock(
    request: Request,
    product_id: int,
    payload: ReleaseStockRequest,
    db: DbDep,
    redis: RedisDep,
    user: TokenPayload = Depends(require_seller),
):
    repo = InventoryRepository(db)
    result = await repo.release(product_id, payload.order_id)
    if result.changed:
        await _invalidate_cache(redis, product_id)
        await publish_inventory_event(request, EventType.INVENTORY_RELEASED, result.inventory)
    return InventoryResponse.model_validate(result.inventory)


@router.post(
    "/{product_id}/adjust",
    response_model=InventoryResponse,
    summary="Adjust stock (manual correction)",
    description="Admin-only signed correction to available stock (stocktake, damage). Not for order flows.",
    responses={404: {"description": "Not found"}, 422: {"description": "Adjustment would result in negative stock"}},
)
async def adjust_stock(
    request: Request, product_id: int, payload: AdjustStockRequest, db: DbDep, redis: RedisDep, user: TokenPayload = Depends(require_admin)
):
    repo = InventoryRepository(db)
    result = await repo.adjust(product_id, payload.delta, payload.reason)
    await _invalidate_cache(redis, product_id)
    await publish_inventory_event(request, EventType.INVENTORY_UPDATED, result.inventory)
    await publish_status_transition_events(request, result)
    return InventoryResponse.model_validate(result.inventory)


@router.post(
    "/{product_id}/restock",
    response_model=InventoryResponse,
    summary="Restock a product",
    description="Adds quantity back to available stock (new stock arrival, refund return).",
    responses={404: {"description": "Not found"}},
)
async def restock_product(
    request: Request, product_id: int, payload: RestockRequest, db: DbDep, redis: RedisDep, user: TokenPayload = Depends(require_seller)
):
    repo = InventoryRepository(db)
    result = await repo.restock(product_id, payload.quantity)
    await _invalidate_cache(redis, product_id)
    await publish_inventory_event(request, EventType.STOCK_RESTORED, result.inventory)
    return InventoryResponse.model_validate(result.inventory)


@admin_router.post(
    "/bulk-update",
    response_model=list[BulkInventoryResult],
    summary="Bulk update inventory metadata",
    description="Updates sku/warehouse/thresholds for many products at once. Each item is locked and committed "
    "individually so one bad item doesn't roll back the whole batch.",
)
async def bulk_update(
    request: Request, payload: BulkInventoryUpdate, db: DbDep, redis: RedisDep, user: TokenPayload = Depends(require_admin)
):
    repo = InventoryRepository(db)
    results: list[BulkInventoryResult] = []
    for item in payload.items:
        try:
            inventory = await repo.get_for_update(item.product_id)
            if inventory is None:
                results.append(BulkInventoryResult(product_id=item.product_id, success=False, error="Inventory not found"))
                continue
            fields = item.model_dump(exclude={"product_id"}, exclude_unset=True)
            for key, value in fields.items():
                if value is not None:
                    setattr(inventory, key, value)
            inventory.version += 1
            await db.commit()
            await db.refresh(inventory)
            await _invalidate_cache(redis, item.product_id)
            await publish_inventory_event(request, EventType.INVENTORY_UPDATED, inventory)
            results.append(BulkInventoryResult(product_id=item.product_id, success=True))
        except Exception as exc:
            await db.rollback()
            log.exception("bulk_inventory_item_failed", product_id=item.product_id)
            results.append(BulkInventoryResult(product_id=item.product_id, success=False, error=str(exc)))
    return results


@admin_router.get(
    "/health-report",
    response_model=HealthReportResponse,
    summary="Inventory health report",
    description="Aggregate counts across the whole catalog: stock-status breakdown, total available/reserved units. "
    "Cached for a short TTL; not point-invalidated on writes (whole-table aggregate).",
)
async def health_report(db: DbDep, redis: RedisDep, user: TokenPayload = Depends(require_admin)):
    if cached := await cache_get_json(redis, HEALTH_REPORT_CACHE_KEY):
        return cached
    report = await InventoryRepository(db).health_report()
    await cache_set_json(redis, HEALTH_REPORT_CACHE_KEY, report, get_settings().health_report_cache_ttl_seconds)
    return report


@internal_router.get("/inventory/{product_id}", response_model=InventoryResponse)
async def internal_get_inventory(product_id: int, db: DbDep):
    """Service-to-service stock lookup (future Order Service checkout-time check)."""
    inventory = await InventoryRepository(db).get_by_product(product_id)
    if inventory is None:
        raise NotFoundError("Inventory not found for product")
    return InventoryResponse.model_validate(inventory)
