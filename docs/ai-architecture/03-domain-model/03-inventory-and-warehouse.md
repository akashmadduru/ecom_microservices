# Cluster 03: Inventory & Warehouse

Last verified against commit: `f6115d1`

Domains: Inventory (Built), Warehouse (Conceptual-only).

Built domain maps to `inventory_service` (port 8004, `inventory_db`).
`inventory_service` is also the first real Kafka **consumer** in this codebase — it
reacts to Order/Payment/Refund events that have no real producer yet, validated only
against hand-built test fixtures (`python/services/inventory_service/tests/unit/test_consumers.py`),
not a live end-to-end flow.

---

## Domain: Inventory

### Overview
- **Bounded Context:** `inventory_service`
- **Maturity Tag:** Built
- **Grounding:** `python/services/inventory_service/src/inventory_service/models.py::Inventory`,
  `InventoryReservation`; `repo.py`; `consumers.py`

### Business Responsibilities
- Own the stock ledger for every product: how much is available, reserved, and sold.
- Prevent overselling under concurrent requests for the same product.
- Classify stock health (`IN_STOCK` / `LOW_STOCK` / `OUT_OF_STOCK`) from a single
  threshold rule and emit edge-triggered alerts, not repeated ones.
- Provide idempotent reserve/release/finalize/restock operations keyed by
  `(product_id, order_id)`, so retried calls (from a REST client or a redelivered Kafka
  event) are no-ops instead of double-mutations.

### Aggregate Roots
| Aggregate | Identity | Invariants it enforces |
|---|---|---|
| Inventory | `product_id` (unique) | `available_quantity >= 0` and `reserved_quantity >= 0` (DB `CHECK` constraints); `status` always derived from `available_quantity` vs `reorder_threshold` via `status_for()`, never set independently |
| InventoryReservation | `(product_id, order_id)` (unique together) | One reservation record per product/order pair — the business-level idempotency key |

### Entities
| Entity | Belongs to Aggregate | Notes |
|---|---|---|
| InventoryReservation | *(standalone aggregate, not a child of Inventory — see note)* | Modeled as its own aggregate root rather than a child entity, because its uniqueness key `(product_id, order_id)` and lifecycle (`RESERVED` → `RELEASED`/`DEDUCTED`) are independent of any single Inventory row's current state |

### Value Objects
| Value Object | Shape | Notes |
|---|---|---|
| InventoryStatus | `StrEnum`: `IN_STOCK`, `LOW_STOCK`, `OUT_OF_STOCK` | Pure function of `available_quantity` vs `reorder_threshold`, computed by `status_for()` |
| ReservationStatus | `StrEnum`: `RESERVED`, `RELEASED`, `DEDUCTED` | — |
| Quantity fields | `available_quantity`, `reserved_quantity`, `sold_quantity`, `safety_stock`, `reorder_threshold` — all `Integer` | `safety_stock` is tracked but not read by any status/mutation logic today — see Open Questions |

### Domain Services
- `status_for(available_quantity, reorder_threshold) -> InventoryStatus` — pure
  classification, used both to keep `Inventory.status` in sync after every mutation and
  to detect edge transitions for event publishing.

### Application Services
- `reserve` / `release` / `finalize_sale` / `restock` / `adjust` (`InventoryRepository`)
  — each takes a Postgres row lock (`SELECT ... FOR UPDATE`) inside a transaction; the
  code's own reasoning (per the root README) is that this is "the simplest correct way
  to prevent overselling under concurrent requests for the same product."
- `update_metadata` — optimistic-locked (`version` column) update for sku/warehouse/
  thresholds, deliberately *not* row-locked since metadata edits rarely conflict.
- `health_report` — whole-table aggregate (stock-status breakdown, total available/
  reserved units), Redis-cached with a short TTL, not point-invalidated on writes.

### Repository Interfaces
- `InventoryRepository` (`repo.py`), built on `ecom_common`'s generic repository base.

### Domain Events
| Event | Trigger | Maturity |
|---|---|---|
| `InventoryCreated` | `POST /inventory` | Built |
| `InventoryUpdated` | `PUT /inventory/{product_id}` (metadata) and `adjust()` | Built |
| `InventoryReserved` | `reserve()` succeeds — REST `POST /inventory/{id}/reserve` or the `OrderCreated` consumer | Built |
| `InventoryReleased` | `release()` succeeds — REST `POST /inventory/{id}/release`, or the `OrderCancelled`/`PaymentFailed` consumers | Built |
| `StockDeducted` | `finalize_sale()` — the `PaymentCompleted` consumer (canonical trigger) or the `OrderConfirmed` consumer (defensive fallback for COD-style flows) | Built |
| `StockRestored` | `restock()` — REST `POST /inventory/{id}/restock`, or the `RefundCompleted` consumer | Built |
| `LowStockDetected` | Edge transition into `LOW_STOCK` from `IN_STOCK` only, on any quantity mutation | Built |
| `OutOfStockDetected` | Edge transition into `OUT_OF_STOCK` from any other state, on any quantity mutation | Built |

All published to `Topics.INVENTORY`, best-effort (a failed publish is logged and never
fails the write path — consumers are expected to reconcile via the internal `GET`
backfill endpoints).

### Commands
- CreateInventory, UpdateInventoryMetadata, ReserveStock, ReleaseStock, AdjustStock
  (admin-only, signed correction), RestockProduct, BulkUpdateInventoryMetadata
  (admin-only, per-item commit so one bad item doesn't roll back the batch).

### Queries
- GetInventoryByProduct (Redis-cached), ListInventory (filterable by status/warehouse),
  LowStockReport, OutOfStockReport, HealthReport (admin-only), and the internal
  `GET /internal/inventory/{product_id}` lookup — documented in-code as existing "for
  the future Order Service checkout-time check," which does not exist yet.

### Relationships to Other Domains
| Domain | Relationship | Direction | Notes |
|---|---|---|---|
| Product | `product_id` reference, no DB-level FK (separate databases) | Product → Inventory | Application-layer referential integrity only |
| Order (Reserved-in-infra) | Consumes `OrderCreated` (→ reserve), `OrderConfirmed` (→ finalize, defensive fallback), `OrderCancelled` (→ release) | Order → Inventory | Real consumer code exists; no real producer exists |
| Payment (Reserved-in-infra) | Consumes `PaymentCompleted` (→ finalize, canonical trigger), `PaymentFailed` (→ release) | Payment → Inventory | Same — consumer real, producer doesn't exist |
| Refund (Reserved-in-infra) | Consumes `RefundCompleted` (→ restock) | Refund → Inventory | Same |
| Warehouse | `warehouse_location` is a plain string field on Inventory today, not a relationship to a separate aggregate | Inventory → Warehouse | See below |

### Open Questions / Design Gaps
- `safety_stock` is a persisted column with no code path that reads it — `status_for()`
  only compares `available_quantity` to `reorder_threshold`. Whether it's meant to lower
  the effective threshold, block reservations before the true zero point, or is simply
  unused scaffolding is unresolved in the current code.
- No rejection event is published today when `OrderCreated` hits insufficient stock —
  the consumer logs a `ConflictError` and continues to the next item
  (`consumers.py:_for_each_item`, comment: "no rejection event is published today since
  no consumer exists yet to react to one"). A real Order Service would need this signal.

---

## Domain: Warehouse

### Overview
- **Bounded Context:** none dedicated
- **Maturity Tag:** Conceptual-only
- **Grounding:** `Inventory.warehouse_location: str`, default `"DEFAULT"` — a plain
  string column, not a foreign key to any warehouse table. The model's own docstring
  states the constraint explicitly: *"One row per product (single warehouse per product
  in v1 — `warehouse_location` is tracked but not yet part of the uniqueness key;
  multi-warehouse would re-key lookups to `(product_id, warehouse_location)`)."* This
  matches the root README's Inventory-lifecycle section verbatim: "Each product has one
  `inventory` row (single warehouse per product in v1)."

### Business Responsibilities (proposed)
- Represent a physical stock location as its own entity (address, capacity, active/
  inactive status) instead of a free-text label.
- Enable the multi-warehouse model the current schema explicitly anticipates but does
  not implement: multiple `Inventory` rows per product, one per warehouse, with stock
  reservation/allocation logic that picks a warehouse (nearest, cheapest to ship, or
  simply "has stock") rather than assuming exactly one location per product.

### Aggregate Roots (proposed)
| Aggregate | Identity | Invariants it enforces |
|---|---|---|
| Warehouse | `warehouse_id` | Would own capacity/location metadata; Inventory would reference it instead of embedding a string |

### Entities (proposed)
| Entity | Belongs to Aggregate | Notes |
|---|---|---|
| *(none proposed beyond Warehouse itself)* | — | — |

### Value Objects (proposed)
| Value Object | Shape | Notes |
|---|---|---|
| Address | street/city/region/postal/country | Only needed if warehouse selection becomes distance-aware |

### Domain Services / Application Services / Repository Interfaces
None exist. If built, this is the one Conceptual-only domain in this catalog with the
clearest, code-documented migration path already anticipated by the current schema
comment — re-key `Inventory`'s uniqueness from `product_id` alone to
`(product_id, warehouse_location)` (or a proper FK), which the model docstring names
directly as the multi-warehouse migration shape.

### Domain Events (proposed)
| Event | Trigger | Maturity |
|---|---|---|
| `WarehouseCreated` / `WarehouseCapacityChanged` | Not reserved anywhere | Conceptual-only |

### Commands / Queries (proposed)
- CreateWarehouse, ListWarehouses, AllocateStockAcrossWarehouses — proposed only.

### Relationships to Other Domains
| Domain | Relationship | Direction | Notes |
|---|---|---|---|
| Inventory | Would become a real FK target for `warehouse_location`; today just a string | Warehouse → Inventory | See the model docstring quoted above for the exact re-keying shape already anticipated |
| Vendor (cluster 01, Conceptual-only) | Would be the proposed target of vendor-supplied stock replenishment | Vendor → Warehouse | Both are design-only; no code evidence for either side of this relationship |

### Open Questions / Design Gaps
- Multi-warehouse reservation semantics (which warehouse gets decremented first, whether
  reservations can span warehouses for a single order line) are entirely undesigned —
  the current single-warehouse model has no need for them and this document does not
  invent an answer without a driving requirement.
