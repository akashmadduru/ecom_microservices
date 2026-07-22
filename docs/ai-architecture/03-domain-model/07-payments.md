# Cluster 07: Payments

Last verified against commit: `f6115d1`

Domains: Payment, Refund — both Reserved-in-infra. Like Order (cluster 06), both
domains' events are already **consumed** by `inventory_service`, even though no
`payment_service` exists and there is no gateway route dedicated to Refund specifically
(only `/payments`, which the route table does not further distinguish from a refund
sub-flow).

---

## Domain: Payment

### Overview
- **Bounded Context:** proposed `payment_service`
- **Maturity Tag:** Reserved-in-infra
- **Grounding:** `EventType.PAYMENT_STARTED`, `PAYMENT_COMPLETED`, `PAYMENT_FAILED`,
  `Topics.PAYMENT`; gateway route `/payments` → `payment_service_url`, policy
  `{"*": AUTHENTICATED}`; `PAYMENT_COMPLETED` and `PAYMENT_FAILED` are both **actively
  consumed** by `inventory_service` (`consumers.py`)

### Business Responsibilities (proposed)
- Own the transaction-capture aggregate: charge attempt, provider reference, and
  outcome, for a given Order.
- Be the canonical finalize/release trigger Inventory already listens for:
  `PaymentCompleted` → `finalize_sale()` (reserved → sold, `StockDeducted`),
  `PaymentFailed` → `release()` (reserved → available, `InventoryReleased`). This is the
  primary, non-fallback finalize path — `OrderConfirmed` (cluster 06) is explicitly the
  fallback for cases where confirmation precedes capture (COD-style).

### Aggregate Roots (proposed)
| Aggregate | Identity | Invariants it enforces |
|---|---|---|
| Payment | `payment_id` (references `order_id`) | Exactly one terminal outcome per attempt (`COMPLETED` xor `FAILED`); a `PaymentStarted` must precede either terminal event |

### Entities (proposed)
| Entity | Belongs to Aggregate | Notes |
|---|---|---|
| PaymentAttempt | Payment | Would model retries after a failed charge as distinct attempts under the same logical Payment, rather than one flat record |

### Value Objects (proposed)
| Value Object | Shape | Notes |
|---|---|---|
| ProviderReference | `{provider: str, external_id: str}` | Opaque reference to whatever payment processor is integrated (Stripe, Razorpay, etc.) — no processor is chosen or implied by anything in this codebase |

### Domain Services / Application Services / Repository Interfaces
None exist.

### Domain Events
| Event | Trigger | Maturity |
|---|---|---|
| `PaymentStarted` | Charge attempt initiated | Reserved-in-infra — no consumer exists for this one, unlike the two below |
| `PaymentCompleted` | Charge succeeds | Reserved-in-infra — **consumed today** (→ `finalize_sale()`, canonical trigger) |
| `PaymentFailed` | Charge fails | Reserved-in-infra — **consumed today** (→ `release()`) |

The `inventory_service` consumer expects the same item-list payload shape as Order's
events: `{"order_id": str, "items": [{"product_id": int, "quantity": int}, ...]}` — this
is a real, load-bearing contract detail for whoever implements the producer side, not a
convention this document is inventing.

### Commands (proposed)
- InitiatePayment(order_id, amount), ConfirmPayment(provider webhook/callback).

### Queries (proposed)
- GetPaymentStatus(order_id).

### Relationships to Other Domains
| Domain | Relationship | Direction | Notes |
|---|---|---|---|
| Order (Reserved-in-infra, cluster 06) | Payment is initiated for an Order; `PaymentCompleted` is the canonical order-finalize trigger via Inventory | Order ↔ Payment | Not directly coupled in code — both only connect through Inventory's shared consumer today |
| Inventory | `PaymentCompleted`/`PaymentFailed` already drive real state transitions | Payment → Inventory | Real, tested consumer code; no real producer |
| Refund | A Refund logically follows a completed Payment | Payment → Refund | See below |

### Open Questions / Design Gaps
- No payment provider is chosen anywhere in the repository (no Stripe/Razorpay SDK
  dependency, no webhook-signature-verification code) — this is a fully greenfield
  integration decision, not something inferable from existing code.
- Whether `PaymentStarted` (which has no consumer) is meant to support an async/
  redirect-based payment flow (start now, complete later via webhook) is a reasonable
  inference from its existence but is not confirmed by any consuming code.

---

## Domain: Refund

### Overview
- **Bounded Context:** proposed — would most likely live inside `payment_service`
  rather than as a fully separate service, given both share the `Topics.PAYMENT` topic
  and are grouped under one reserved-event set alongside `PaymentStarted/Completed/Failed`
- **Maturity Tag:** Reserved-in-infra
- **Grounding:** `EventType.REFUND_INITIATED`, `REFUND_COMPLETED` — `RefundCompleted` is
  **actively consumed** by `inventory_service` (→ `restock()`, `StockRestored`)

### Business Responsibilities (proposed)
- Own the money-return aggregate for a given Payment/Order — distinct from Returns
  (cluster 06), which owns the request/approval workflow that would typically precede
  it. Refund, as reserved today, only concerns the financial/stock consequence: money
  goes back to the customer, stock goes back to `available_quantity`.

### Aggregate Roots (proposed)
| Aggregate | Identity | Invariants it enforces |
|---|---|---|
| Refund | `refund_id` (references `order_id`/`payment_id`) | Refunded amount cannot exceed the original Payment amount; a Refund can only be initiated against a `PaymentCompleted` payment |

### Entities / Value Objects (proposed)
| Value Object | Shape | Notes |
|---|---|---|
| RefundAmount | `Decimal` | Full vs partial refund is not distinguished by anything in the reserved event names — both would use the same `RefundInitiated`/`RefundCompleted` pair |

### Domain Services / Application Services / Repository Interfaces
None exist.

### Domain Events
| Event | Trigger | Maturity |
|---|---|---|
| `RefundInitiated` | Refund request approved/started | Reserved-in-infra — no consumer exists for this one |
| `RefundCompleted` | Refund processed by the payment provider | Reserved-in-infra — **consumed today** (→ `restock()`, same item-list payload contract as Order/Payment) |

### Commands (proposed)
- InitiateRefund(order_id, amount, reason), ConfirmRefund(provider callback).

### Queries (proposed)
- GetRefundStatus(order_id).

### Relationships to Other Domains
| Domain | Relationship | Direction | Notes |
|---|---|---|---|
| Payment | Refund reverses a completed Payment | Payment → Refund | Both share `Topics.PAYMENT` in the reserved event catalog, suggesting they were designed to be produced by the same service |
| Inventory | `RefundCompleted` already drives a real `restock()` | Refund → Inventory | Real, tested consumer; no real producer |
| Returns (Conceptual-only, cluster 06) | The expected upstream trigger for `RefundInitiated`, once Returns exists | Returns → Refund | Returns has no reserved infra at all today — this relationship is currently one-sided |

### Open Questions / Design Gaps
- Whether Refund is its own bounded context or a sub-module of Payment is not settled by
  the reserved infra alone — both use `Topics.PAYMENT`, which is suggestive but not
  conclusive (a shared topic doesn't necessarily imply a shared service; it could also
  mean two services publish to one topic, discriminated by `event_type`, matching the
  `Topics` docstring's own stated design: "One topic per aggregate; the envelope's
  `event_type` discriminates").
