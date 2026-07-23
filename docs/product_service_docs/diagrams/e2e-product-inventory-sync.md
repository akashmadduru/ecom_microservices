# Diagram: E2E Flow — Product → Inventory Cross-Service Sync

## Diagram Type
Event Flow / Microservice Communication Diagram

## Subject
How a catalog change in `product_service` propagates to `inventory_service` without any
synchronous call or shared database — the eventual-consistency boundary named in the HLD.

## Audience
Engineers debugging a catalog/inventory data-mismatch; engineers adding a new event consumer.

## Required Elements
Both services, their independent databases, the Kafka topic, the best-effort publish semantics,
and the reconciliation fallback path.

## Diagram

```mermaid
sequenceDiagram
    participant Seller
    participant PS as product_service
    participant PDB as product_db
    participant Kafka as Kafka: product.events
    participant Inv as inventory_service
    participant IDB as inventory_db

    Seller->>PS: POST /products/{id}/variants {...}
    PS->>PDB: INSERT product_variants (own transaction, own database)
    PDB-->>PS: commit ok
    PS-->>Kafka: publish ProductVariantCreated {variant_id, product_id, ...}
    Note over PS,Kafka: try/except around the publish call —\na broker outage here never fails the HTTP response\nthat already committed to PDB.

    alt Kafka + inventory_service healthy
        Kafka-->>Inv: deliver ProductVariantCreated
        Inv->>IDB: (not yet implemented) create a zero-quantity\ninventory row keyed by variant_id
        Note over Inv,IDB: inventory_service today consumes Order/Payment/\nRefund events (see its own docs) — a\nProductVariantCreated consumer does not exist yet.\nThis is the reserved integration point, not a live one.
    else Kafka down, or consumer down, or event lost
        Note over Kafka,Inv: No retry queue, no outbox table.\nThe event is simply gone.
        Inv->>PS: GET /internal/products/{product_id}  (reconciliation path)
        PS-->>Inv: current product state (bypasses status filter —\ninternal caller sees non-deleted rows regardless of status)
        Note over Inv: inventory_service is responsible for its own\nreconciliation cadence; product_service does not\npush retries.
    end
```

## Notes

- **This is the concrete illustration of the "no cross-database foreign key" architectural
  constraint** named throughout this service's docs: `inventory_service.inventory.product_id` (or
  a future `variant_id`) is a plain integer, validated against `product_service` only at the
  application layer — either via the event payload at the moment of consumption, or via the
  `/internal/products/{id}` pull-based reconciliation endpoint if the event was missed. Nothing in
  Postgres enforces that the referenced product/variant still exists.
- As of this document, `inventory_service` is a real Kafka **consumer** of Order/Payment/Refund
  events (see its own service docs) but does **not yet** consume `ProductCreated`/
  `ProductVariantCreated` — the topic/event types exist and are published, but the reserved
  integration this diagram depicts is not fully wired up on the receiving end. This diagram
  documents the intended flow and the mechanism (events + reconciliation endpoint), not a
  currently-exercised code path in `inventory_service`.
- `Topics.PRODUCT` (`"product.events"`) carries every event type this service publishes —
  `ProductCreated`, `ProductUpdated`, `ProductDeleted`, `ProductVariantCreated` — discriminated by
  `EventEnvelope.event_type`, not separate topics per event. Partitioning is by `product_id`
  (`partition_key`), preserving per-product event ordering.
