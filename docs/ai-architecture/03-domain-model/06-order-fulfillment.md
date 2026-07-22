# Cluster 06: Order Fulfillment

Last verified against commit: `f6115d1`

Domains: Order (Reserved-in-infra), Shipping (Conceptual-only), Returns
(Conceptual-only, distinct from Refund — cluster 07).

Order is the most consequential Reserved-in-infra domain in this catalog: unlike Cart/
Wishlist/Payment/Notification/Reviews, whose reserved events have no consumer yet,
Order's events (`OrderCreated`, `OrderConfirmed`, `OrderCancelled`) are already actively
**consumed** by `inventory_service` (`consumers.py`). The consumer side of this
integration is real and tested; only the producer (a real Order Service) is missing.

---

## Domain: Order

### Overview
- **Bounded Context:** proposed `order_service`
- **Maturity Tag:** Reserved-in-infra
- **Grounding:** `EventType.ORDER_CREATED`, `ORDER_CONFIRMED`, `ORDER_FAILED`,
  `ORDER_CANCELLED`, `Topics.ORDER`; gateway route `/orders` → `order_service_url`,
  policy `{"POST": {Role.CUSTOMER}, "*": AUTHENTICATED}`; **and** a real, tested
  consumer of three of its four events in `inventory_service`

### Business Responsibilities (proposed)
- Own the purchase-intent aggregate: what was ordered, by whom, at what point-in-time
  price, and its lifecycle from creation through confirmation/cancellation.
- Drive Inventory reservation and finalization by publishing the exact event contract
  `inventory_service` already implements against:
  `{"order_id": str, "items": [{"product_id": int, "quantity": int}, ...]}`
  (`consumers.py`'s own docstring calls this payload shape "a judgment call the eventual
  Order Service should confirm" — it is not a finalized contract, just the one the only
  existing consumer was built against).
- Decide the split between `OrderConfirmed` and `PaymentCompleted` as finalize triggers
  — the existing consumer already treats `OrderConfirmed` as a defensive fallback "for
  COD-style flows where confirmation might precede payment capture," which means Order
  is expected to support at least one non-prepaid checkout flow.

### Aggregate Roots (proposed)
| Aggregate | Identity | Invariants it enforces |
|---|---|---|
| Order | `order_id` (`str` — the existing consumer treats it as an opaque string, not a UUID or int, so no format is presumed) | Line items must reference valid products with positive quantities; state transitions are one-directional (created → confirmed/cancelled/failed, no reopening a cancelled order) |

### Entities (proposed)
| Entity | Belongs to Aggregate | Notes |
|---|---|---|
| OrderLineItem | Order | `{product_id, quantity, unit_price_at_order_time}` — the price must be captured at order time, independent of any later Product price change |

### Value Objects (proposed)
| Value Object | Shape | Notes |
|---|---|---|
| OrderStatus | `CREATED \| CONFIRMED \| CANCELLED \| FAILED` (inferred from the four reserved event types) | No `SHIPPED`/`DELIVERED` states are implied by the reserved events — those would belong to Shipping (below) as a separate lifecycle, or would require extending `EventType` |

### Domain Services (proposed)
- Checkout orchestration: validate cart contents against current Product/Inventory
  state, capture a price snapshot, and emit `OrderCreated`.

### Application Services / Repository Interfaces
None exist.

### Domain Events
| Event | Trigger | Maturity |
|---|---|---|
| `OrderCreated` | Checkout completes | Reserved-in-infra — **consumed today** by `inventory_service` (→ `reserve()`) against hand-built fixtures, no real producer |
| `OrderConfirmed` | Order confirmation (e.g. manual review, or immediate for prepaid) | Reserved-in-infra — **consumed today** (→ `finalize_sale()`, defensive fallback for COD-style flows), no real producer |
| `OrderCancelled` | Customer or system cancels an order | Reserved-in-infra — **consumed today** (→ `release()`), no real producer |
| `OrderFailed` | *(reserved, not consumed anywhere)* | Reserved-in-infra only — no consumer exists for this one, unlike the other three |

### Commands (proposed)
- CreateOrder (from Cart at checkout), ConfirmOrder, CancelOrder.

### Queries (proposed)
- GetOrder(order_id), ListOrdersForCustomer(user_id).

### Relationships to Other Domains
| Domain | Relationship | Direction | Notes |
|---|---|---|---|
| Inventory | `OrderCreated`/`OrderConfirmed`/`OrderCancelled` already drive real Inventory state transitions | Order → Inventory | The only cross-domain integration in this entire catalog with real code on the receiving end |
| Cart (Reserved-in-infra, cluster 05) | Checkout transitions a Cart into an Order | Cart → Order | Neither exists |
| Payment (Reserved-in-infra, cluster 07) | `PaymentCompleted`/`PaymentFailed` are the canonical finalize/release triggers Inventory already listens for, decoupling Order's own confirmation from payment capture | Payment → Order (via Inventory as the shared consumer) | Order and Payment don't call each other directly in any existing code — they're only coupled through Inventory's consumer today |
| Shipping (Conceptual-only) | Would begin after `OrderConfirmed`/payment finalization | Order → Shipping | See below |
| User/Customer (cluster 01) | Orders belong to a customer | Customer → Order | — |

### Open Questions / Design Gaps
- The `OrderCreated` payload contract is explicitly unconfirmed in the existing
  consumer's own docstring — a real Order Service implementation should treat
  `inventory_service`'s current assumption as a starting draft, not a locked contract.
- No `OrderShipped`/`OrderDelivered`/`OrderRefunded` events are reserved in
  `EventType` — if Shipping or Returns (below) are ever built, `ecom_common.events` would
  need new entries, which is a shared-library change outside this domain's own scope.
- No rejection/failure signal flows back from Inventory to Order today (see the Open
  Questions note in cluster 03's Inventory domain) — `OrderFailed` is reserved but has
  no producer anywhere, including from Inventory's side of an insufficient-stock case.

---

## Domain: Shipping

### Overview
- **Bounded Context:** none
- **Maturity Tag:** Conceptual-only
- **Grounding:** none — no reserved `EventType`, no gateway route, no table

### Business Responsibilities (proposed)
- Track fulfillment after an Order is confirmed: carrier assignment, tracking number,
  and delivery status, as a lifecycle independent of Order's own created/confirmed/
  cancelled states.

### Aggregate Roots (proposed)
| Aggregate | Identity | Invariants it enforces |
|---|---|---|
| Shipment | `shipment_id` (references `order_id`) | A shipment can only be created for a confirmed Order; status transitions are one-directional (dispatched → in-transit → delivered, with a separate exception path for lost/returned-to-sender) |

### Entities / Value Objects (proposed)
| Value Object | Shape | Notes |
|---|---|---|
| TrackingInfo | `{carrier, tracking_number, estimated_delivery}` | — |

### Domain Services / Application Services / Repository Interfaces
None exist. Unlike every Reserved-in-infra domain in this catalog, Shipping has zero
infra footprint — no event type, no route — meaning nothing in the current platform
commits to it existing as a separate service versus, say, being folded into Order.

### Domain Events (proposed)
| Event | Trigger | Maturity |
|---|---|---|
| `ShipmentDispatched` / `ShipmentDelivered` | Not reserved anywhere; would require an `ecom_common.events` change | Conceptual-only |

### Commands / Queries (proposed)
- CreateShipment, UpdateTrackingStatus, GetShipment(order_id) — proposed only.

### Relationships to Other Domains
| Domain | Relationship | Direction | Notes |
|---|---|---|---|
| Order | Shipment lifecycle begins after Order confirmation | Order → Shipping | Neither exists |
| Returns | A completed Shipment is the precondition for a Return (can't return what was never delivered) | Shipping → Returns | Both Conceptual-only |

### Open Questions / Design Gaps
- Whether Shipping is its own service or a sub-module of Order is entirely open — no
  infra signal exists either way, unlike (for example) Payment vs Order, which are
  already split by having independent reserved event types and topics.

---

## Domain: Returns

### Overview
- **Bounded Context:** none
- **Maturity Tag:** Conceptual-only
- **Grounding:** none — no reserved `EventType`, no gateway route, no table. Explicitly
  distinct from Refund (cluster 07), which *is* Reserved-in-infra (`RefundInitiated`/
  `RefundCompleted` are real reserved event types already consumed by `inventory_service`
  to trigger `restock()`)

### Business Responsibilities (proposed)
- Model the customer-initiated request-and-approval workflow that precedes a Refund:
  return reason, eligibility window, approval/rejection, and receipt of the physical
  item back into inventory — as distinct from Refund, which (per its existing consumer
  in `inventory_service`) only concerns itself with the *money-and-stock* consequence
  (`RefundCompleted` → `restock()`), not the request/approval process that produces it.

### Aggregate Roots (proposed)
| Aggregate | Identity | Invariants it enforces |
|---|---|---|
| ReturnRequest | `return_id` (references `order_id`) | Can only be created within the platform's return window for a delivered order; must be approved before a Refund can be initiated |

### Entities / Value Objects (proposed)
| Value Object | Shape | Notes |
|---|---|---|
| ReturnReason | enum (defective, wrong item, no longer needed, ...) | — |

### Domain Services / Application Services / Repository Interfaces
None exist.

### Domain Events (proposed)
| Event | Trigger | Maturity |
|---|---|---|
| `ReturnRequested` / `ReturnApproved` / `ReturnRejected` | Not reserved anywhere; would require an `ecom_common.events` change | Conceptual-only |

### Commands / Queries (proposed)
- RequestReturn, ApproveReturn, RejectReturn — proposed only. `ApproveReturn` would be
  the natural trigger for Refund's already-real `RefundInitiated` event, once Returns
  exists as a real producer.

### Relationships to Other Domains
| Domain | Relationship | Direction | Notes |
|---|---|---|---|
| Refund (Reserved-in-infra, cluster 07) | An approved Return is the expected precondition for initiating a Refund | Returns → Refund | Refund's events already exist and are consumed; Returns' would need to be added to `ecom_common.events` before this relationship could be implemented end-to-end |
| Shipping | A Return typically requires the item to actually have shipped/delivered first | Shipping → Returns | Both Conceptual-only |
| Order | References the original `order_id` | Order → Returns | — |

### Open Questions / Design Gaps
- Whether `RefundInitiated` should only ever be publishable as a consequence of an
  approved Return (workflow-gated) or can be initiated directly (e.g. an
  admin-issued goodwill refund with no Return) is unresolved — the current Refund
  domain has no producer at all yet, so nothing constrains the answer today.
