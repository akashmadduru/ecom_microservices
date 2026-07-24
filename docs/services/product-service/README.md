# Product Service — Architecture Documentation

HLD, LLD, and diagrams for `python/services/product_service`, generated via `/generate-hld` +
`/generate-lld`. Grounded directly in the current implementation (post Phase 1 Catalog Core
redesign — see `docs/features/product-catalog-core-phase1.md` and `docs/DecisionLog.md` for that
redesign's own history).

**Last verified against:** working tree as of the Phase 1 Catalog Core redesign
(`product_service` migrations `0001`–`0006`), plus the Full Catalog Seed Generator
(`docs/features/catalog-full-seed-generator.md`) — adds the 13-table seed loader
(`catalog_seeder.py`) and `POST /admin/catalog/seed`, no schema change.

## Read order

1. [`hld/HLD.md`](./hld/HLD.md) — system-level: what this service does, its boundaries, its
   consistency/availability tradeoffs, scalability and security posture.
2. [`lld/LLD.md`](./lld/LLD.md) — implementation-level: full data model, full API contract (all
   47 endpoints), DB schema changes, edge cases, error handling, performance rationale.
3. Diagrams (below) — visual companions to both, plus dedicated end-to-end flows.

## Diagrams

| File | Type | Covers |
|---|---|---|
| [`diagrams/context-diagram.md`](./diagrams/context-diagram.md) | System Context | Who calls this service, what it calls, the dual RBAC boundary (gateway + service) |
| [`diagrams/component-diagram.md`](./diagrams/component-diagram.md) | Component | Internal module layering (`routes.py` → `repo.py` → `models.py`) and the `ecom_common` shared-library boundary |
| [`diagrams/er-diagram.md`](./diagrams/er-diagram.md) | ER Diagram | All 13 `product_db` tables and their relationships |
| [`diagrams/e2e-seller-listing-flow.md`](./diagrams/e2e-seller-listing-flow.md) | E2E Sequence | Seller creates a product → variant → primary image, with ownership checks and event publication at each step |
| [`diagrams/e2e-public-browse-flow.md`](./diagrams/e2e-public-browse-flow.md) | E2E Sequence | Anonymous category drill-down → filtered list → cached single-product read |
| [`diagrams/e2e-product-inventory-sync.md`](./diagrams/e2e-product-inventory-sync.md) | E2E Event Flow | Cross-service propagation to `inventory_service` via Kafka, and the reconciliation fallback — the concrete illustration of this platform's "no cross-database FK" rule |
| [`diagrams/e2e-product-lifecycle.md`](./diagrams/e2e-product-lifecycle.md) | State Diagram | Every `Product.status` value and — importantly — which transitions actually have an API endpoint today |

## ⚠ Critical gap surfaced while writing this documentation

**Newly-created products can never become publicly visible.** `ProductCreate`/`ProductUpdate`
have no `status` field, and no endpoint transitions `Product.status` after creation — every
product created via `POST /products` stays `DRAFT` forever. Combined with the (correct, and
separately shipped) Phase 1 fix that restricts public reads to `status == PUBLISHED` only, the
practical effect is that the public catalog only ever shows the ~3271 pre-existing seeded
products (retroactively marked `PUBLISHED` by migration `0006`'s backfill) — nothing created
through the API since this redesign will ever appear there.

This is **not fixed by this documentation pass** — it surfaced while writing
`diagrams/e2e-product-lifecycle.md` and is a real product/moderation-workflow decision (who can
publish: the seller themselves, an admin approval step, or both), not something to bolt on
silently. Full detail in that diagram's Notes section and in `docs/FutureWork.md`.

## Directory layout

```
docs/services/product-service/
├── README.md          (this file)
├── hld/
│   └── HLD.md
├── lld/
│   └── LLD.md
└── diagrams/
    ├── context-diagram.md
    ├── component-diagram.md
    ├── er-diagram.md
    ├── e2e-seller-listing-flow.md
    ├── e2e-public-browse-flow.md
    ├── e2e-product-inventory-sync.md
    └── e2e-product-lifecycle.md
```
