# AI Architecture Documentation Blueprint

> **This is a documentation blueprint, not implemented infrastructure.** Every file
> listed below is either (a) a written document that describes real, currently-shipped
> code, or (b) a written document that proposes a design for something that does not
> exist in the codebase yet, or (c) a planned-but-not-yet-drafted file. The "Grounding"
> column tells you which. Nothing in this tree changes runtime behavior, config, or
> the `.claude/` agent framework — see `00-scope-and-relationship-to-claude-framework.md`
> for the explicit statement of that boundary.

**Last verified against commit:** `f6115d1`

## How to use this index

1. Read `00-scope-and-relationship-to-claude-framework.md` first — it explains what this
   tree is, what it is not, and how it relates to the pre-existing `.claude/` agent
   framework.
2. Read `03-domain-model/00-domain-catalog.md` next — it is the single table that
   answers "is domain X real yet, and if so, in which service."
3. Drill into the individual cluster files under `03-domain-model/` for the domains you
   care about.
4. `01-mcp-strategy.md` and `02-rag-design.md` are planned but not yet drafted in this
   pass (see the resequencing note in `00-scope-and-relationship-to-claude-framework.md`
   for why RAG design is queued ahead of MCP strategy despite the file numbering).
5. `06-dev-workflow-and-claude-framework-overlay.md` is planned but not yet drafted.

## File map

| # | File | Description | Status | Grounding |
|---|---|---|---|---|
| 00 | [`00-scope-and-relationship-to-claude-framework.md`](./00-scope-and-relationship-to-claude-framework.md) | States this blueprint's docs-only boundary, its relationship to `.claude/prompts/orchestration-protocol.md`, the pre-existing `.github/agents/microservices-backend.agent.md` inconsistency, and the drafting resequencing (RAG before MCP) | Done (this pass) | Grounded in repo facts |
| 01 | `01-mcp-strategy.md` | MCP server selection/ranking for this repo's tooling needs, including retrieval/vector-DB-adjacent categories | Planned, not yet drafted | N/A — file does not exist yet |
| 02 | `02-rag-design.md` | RAG design (vector DB choice, chunking/indexing strategy for this codebase) — drafted before 01 per the resequencing rationale | Planned, not yet drafted | N/A — file does not exist yet |
| 03 | [`03-domain-model/00-domain-catalog.md`](./03-domain-model/00-domain-catalog.md) | Summary table of all 29 domains named in the DDD sweep: cluster, maturity tag, real service or reserved event type, one-line responsibility | Done (this pass) | Mixed — see Maturity Tag column per row |
| 03 | [`03-domain-model/01-identity-and-access.md`](./03-domain-model/01-identity-and-access.md) | Identity, User, Authentication, Authorization, Customer, Seller, Vendor | Done (this pass) | Identity/User/Authentication/Authorization/Customer: Built, grounded in `auth_service`. Seller: Conceptual-only, partially evidenced by `Role.SELLER`. Vendor: Conceptual-only, no code evidence |
| 03 | [`03-domain-model/02-catalog.md`](./03-domain-model/02-catalog.md) | Product, Category, Brand | Done (this pass); updated for Phase 1 Catalog Core (see `docs/features/product-catalog-core-phase1.md`) | Product, Category, Brand: all Built, grounded in `product_service` |
| 03 | [`03-domain-model/03-inventory-and-warehouse.md`](./03-domain-model/03-inventory-and-warehouse.md) | Inventory, Warehouse | Done (this pass) | Inventory: Built, grounded in `inventory_service`. Warehouse: Conceptual-only |
| 03 | [`03-domain-model/04-pricing-and-promotions.md`](./03-domain-model/04-pricing-and-promotions.md) | Pricing, Discount, Promotion, Coupon | Done (this pass) | All Conceptual-only |
| 03 | [`03-domain-model/05-shopping.md`](./03-domain-model/05-shopping.md) | Cart, Wishlist | Done (this pass) | Reserved-in-infra — reserved `EventType` values and gateway routes exist, no service |
| 03 | [`03-domain-model/06-order-fulfillment.md`](./03-domain-model/06-order-fulfillment.md) | Order, Shipping, Returns | Done (this pass) | Order: Reserved-in-infra. Shipping/Returns: Conceptual-only |
| 03 | [`03-domain-model/07-payments.md`](./03-domain-model/07-payments.md) | Payment, Refund | Done (this pass) | Both Reserved-in-infra |
| 03 | [`03-domain-model/08-engagement.md`](./03-domain-model/08-engagement.md) | Reviews, Notification | Done (this pass) | Both Reserved-in-infra |
| 03 | [`03-domain-model/09-discovery-and-intelligence.md`](./03-domain-model/09-discovery-and-intelligence.md) | Search, Analytics, Recommendation, Reporting | Done (this pass) | Search: Reserved-in-infra (gateway route only, no reserved `EventType`) — see the deviation note inside the file. Analytics/Recommendation/Reporting: Conceptual-only |
| 04–05 | *(reserved, unscoped)* | Not yet planned as of this pass. Numbers held to preserve ordering; no topic commitment made | Not started | N/A |
| 06 | `06-dev-workflow-and-claude-framework-overlay.md` | Annotates/overlays the existing Standard Pipeline in `.claude/prompts/orchestration-protocol.md` for this repo's specific domain model and service boundaries — never edits the live pipeline file | Planned, not yet drafted | N/A — file does not exist yet |

## Maintenance

Every file in this tree carries a header of the form:

```
Last verified against commit: <short-hash>
```

When a file's factual claims are re-checked against the repo (not merely re-read), update
that header to the current `git rev-parse --short HEAD`. A stale header is not an error by
itself, but a header more than a few commits behind `HEAD` on files touching `services/`,
`libs/ecom_common/`, or `api_gateway/route_table.py` should be treated as a signal to
re-verify before trusting the content.

This README's own file map must be updated whenever a file listed as "Planned, not yet
drafted" is written, or when a new file is added to the tree — do not let the index drift
from the directory contents.
