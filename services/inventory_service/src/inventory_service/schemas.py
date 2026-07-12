from ecom_common.pagination import Pagination
from pydantic import BaseModel, ConfigDict, Field


class InventoryCreate(BaseModel):
    product_id: int = Field(..., description="Product id in product_service's catalog", examples=[101])
    sku: str = Field(..., min_length=1, max_length=64, examples=["SKU-GAMING-WHEEL-001"])
    warehouse_location: str = Field("DEFAULT", max_length=120, examples=["DEFAULT"])
    available_quantity: int = Field(0, ge=0, examples=[100])
    safety_stock: int = Field(0, ge=0, examples=[10])
    reorder_threshold: int = Field(10, ge=0, examples=[20])

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "product_id": 101,
                "sku": "SKU-GAMING-WHEEL-001",
                "warehouse_location": "DEFAULT",
                "available_quantity": 100,
                "safety_stock": 10,
                "reorder_threshold": 20,
            }
        }
    )


class InventoryUpdate(BaseModel):
    """Metadata-only update (sku/warehouse/thresholds) — quantities are mutated
    exclusively via reserve/release/restock/adjust, never here."""

    sku: str | None = Field(None, min_length=1, max_length=64)
    warehouse_location: str | None = Field(None, max_length=120)
    safety_stock: int | None = Field(None, ge=0)
    reorder_threshold: int | None = Field(None, ge=0)
    version: int = Field(..., description="Optimistic-lock token from the last read; mismatch returns 409")

    model_config = ConfigDict(
        json_schema_extra={"example": {"safety_stock": 15, "reorder_threshold": 25, "version": 1}}
    )


class InventoryResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "id": 1,
                "product_id": 101,
                "sku": "SKU-GAMING-WHEEL-001",
                "warehouse_location": "DEFAULT",
                "available_quantity": 88,
                "reserved_quantity": 12,
                "sold_quantity": 40,
                "safety_stock": 10,
                "reorder_threshold": 20,
                "status": "IN_STOCK",
                "version": 3,
            }
        },
    )

    id: int
    product_id: int
    sku: str
    warehouse_location: str
    available_quantity: int
    reserved_quantity: int
    sold_quantity: int
    safety_stock: int
    reorder_threshold: int
    status: str
    version: int


class InventoryPage(BaseModel):
    items: list[InventoryResponse]
    pagination: Pagination


class ReserveStockRequest(BaseModel):
    order_id: str = Field(..., min_length=1, max_length=64, description="Idempotency key; retries are safe")
    quantity: int = Field(..., gt=0)

    model_config = ConfigDict(json_schema_extra={"example": {"order_id": "order-8f3c1a", "quantity": 2}})


class ReleaseStockRequest(BaseModel):
    order_id: str = Field(..., min_length=1, max_length=64)

    model_config = ConfigDict(json_schema_extra={"example": {"order_id": "order-8f3c1a"}})


class RestockRequest(BaseModel):
    quantity: int = Field(..., gt=0)

    model_config = ConfigDict(json_schema_extra={"example": {"quantity": 50}})


class AdjustStockRequest(BaseModel):
    delta: int = Field(..., description="Signed correction; negative reduces available stock (e.g. damage/stocktake)")
    reason: str = Field(..., min_length=1, max_length=500)

    model_config = ConfigDict(json_schema_extra={"example": {"delta": -3, "reason": "Damaged in warehouse stocktake"}})


class BulkInventoryItem(BaseModel):
    product_id: int
    safety_stock: int | None = Field(None, ge=0)
    reorder_threshold: int | None = Field(None, ge=0)
    warehouse_location: str | None = Field(None, max_length=120)


class BulkInventoryUpdate(BaseModel):
    items: list[BulkInventoryItem] = Field(..., min_length=1)

    model_config = ConfigDict(
        json_schema_extra={"example": {"items": [{"product_id": 101, "reorder_threshold": 25}, {"product_id": 102, "safety_stock": 5}]}}
    )


class BulkInventoryResult(BaseModel):
    product_id: int
    success: bool
    error: str | None = None


class HealthReportResponse(BaseModel):
    total_skus: int
    in_stock_count: int
    low_stock_count: int
    out_of_stock_count: int
    total_available_quantity: int
    total_reserved_quantity: int

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "total_skus": 500,
                "in_stock_count": 420,
                "low_stock_count": 60,
                "out_of_stock_count": 20,
                "total_available_quantity": 48210,
                "total_reserved_quantity": 1340,
            }
        }
    )
