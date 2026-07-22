# Future Work

Append-only backlog surfaced during completed work. Each section accumulates across
tasks; items are not removed when superseded, only marked done/superseded inline.

## Backlog Items Identified During This Task (Phase 1 Catalog Core, 2026-07-19)

| Item | Category (Perf/Debt/Feature/Security/DX) | Priority | Rationale |
|---|---|---|---|
| Phase 2: Marketplace split — separate shared catalog content from per-seller pricing/listing | Feature | High | `Product.retail_price`/`discount`/`seller_id` still model one product row as exactly one seller's listing; a real marketplace needs N sellers per catalog item, each with their own price/stock/listing status. This is the next planned phase per the original 4-phase redesign. |
| Phase 3: Inventory re-key onto `ProductVariant` | Feature/Debt | High | `inventory_service` still keys stock off `Product.id`. Now that `ProductVariant` exists as the natural SKU-level unit (barcode/UPC/EAN, dimensions, warranty), inventory should track stock per variant, not per product. Requires coordinated changes in `inventory_service` (separate database) — sequencing/dual-read strategy needs its own plan. |
| Phase 4: Legacy-column cleanup — drop `products.category`/`sub_category`/`brand` | Debt | Medium (blocked on backfill below) | These columns are redundant with `category_id`/`brand_id` post-backfill. Dropping them removes the dual-representation footgun called out in `docs/DecisionLog.md`. Cannot happen before the backfill item below and a consumer audit confirming nothing still reads the flat columns. |
| Backfill legacy `category`/`sub_category`/`brand` free text into `category_id`/`brand_id`/`manufacturer_id` | Debt/Feature | High | Deliberately deferred in Phase 1 (see `docs/DecisionLog.md`). Requires a data-quality/dedup pass first — curate a canonical taxonomy from the ~3271 seeded rows' distinct free-text values (dedupe case/whitespace variants), then map. Until this runs, the new `brand_id`/`category_id` filters on `GET /products` are functionally empty for all pre-existing catalog data. |
| Category rename/re-parent support | Feature | Medium | `CategoryUpdate` currently only allows `is_active`/`sort_order`. Renaming or moving a category requires recomputing `slug`/`path`/`depth` for the entire subtree (every descendant's materialized `path` changes), which isn't implemented. Needs its own design pass — likely a background job for large subtrees rather than a synchronous request. |
| Consider soft-delete for `Brand`/`Manufacturer`/`Category`/`Tag`/`Collection`, for consistency with `Product` | Debt/DX | Low | Scoped out of Phase 1 deliberately (see `docs/DecisionLog.md`) — these are low-volume, admin-only tables and `Category`/`Collection` already have explicit dependent-record delete guards. Worth revisiting only if an audit-trail or accidental-admin-delete incident makes the inconsistency painful in practice. |
| Wire up a real consumer for `search_document` / `GET /internal/products` | Feature | Low (until Search domain is prioritized) | Phase 1 added a generated (`STORED`) full-text-search `search_document` tsvector column and a GIN index on it, and `GET /internal/products` already exists "for search-service backfill" per its own docstring — but no Search service exists yet (still Reserved-in-infra per `docs/ai-architecture/03-domain-model/09-discovery-and-intelligence.md`). This is now more actionable than before since the search-ready column already exists unused. |
| Promote `Manufacturer` to its own row in `docs/ai-architecture/03-domain-model/00-domain-catalog.md` | DX (docs) | Low | This documentation pass grounded `Manufacturer` as a footnote under the Brand domain section in `02-catalog.md` (it's a new Built aggregate but wasn't one of the three domains originally scoped to that cluster file). Whether it deserves its own domain-catalog table row is an open documentation question, not a code question. |
| Reconcile `docs/ai-architecture/04-industry-research-and-patterns.md` with the now-Built Category/Brand domains | DX (docs) | Medium | That file (lines ~55, ~66-72) still states "Category/Brand collapsed into flat columns on `Product` rather than separate aggregates" and argues this "should not be fixed preemptively" — both now factually contradict the updated `02-catalog.md` and `00-domain-catalog.md`. Not touched in this pass (out of the explicitly scoped file set for this task); flagging so the contradiction doesn't sit unresolved. |

## Deferred Technical Debt

- **Dual representation of category/brand on `Product`.** `Product` now carries both
  the legacy free-text columns and the new nullable FKs with no enforced consistency
  between them (see `docs/DecisionLog.md`, "Extend `products` additively"). Any code
  path reading one without the other can produce inconsistent results until the backfill
  item above runs. Knowingly deferred because normalizing immediately would have
  required a data-quality pass that would have blocked all of Phase 1.
- **`product_name` → `title` rename has no compatibility shim.** Deliberately deferred
  risk, not deferred work — see `docs/DecisionLog.md`. Re-verify no raw-SQL consumer of
  the old column name exists before Phase 2 touches this table again.
- **Hard-coded `ADMIN`-only gate on all new taxonomy write endpoints, no
  seller-self-service for anything but their own products/variants/images.** This
  matches the existing authorization model (`Role.SELLER`/`Role.ADMIN` via
  `require_roles`) and wasn't flagged as a problem during this phase, but is worth
  reassessing once Phase 2 (marketplace split) makes sellers a more central actor —
  e.g. would sellers ever propose new Brand/Category entries subject to admin approval?

## Architecture Evolution Candidates

- **Phase 2 (Marketplace split):** introduce a `SellerListing`-shaped aggregate
  (or equivalent) that owns `seller_id`/price/stock-visibility per seller, leaving
  `Product` as shared catalog content. Not designed yet beyond the phase name in the
  original 4-phase plan.
- **Phase 3 (Inventory re-key):** `inventory_service` moving from `product_id` to
  `variant_id` as its stock-ledger key is a cross-service change (separate database,
  separate deploy) and will need its own migration/dual-read strategy, distinct from the
  purely additive, single-service approach Phase 1 used.
- **Phase 4 (Cleanup):** dropping `products.category`/`sub_category`/`brand` is a
  genuinely destructive migration (unlike every migration in this phase) — it will need
  a `Migration.md` of its own with an explicit backward-compatibility window once it's
  scheduled, per the `docs/DecisionLog.md` "Extend `products` additively" decision's
  "Revisit When."
- **`.claude/prompts/orchestration-protocol.md` overlay:** `docs/ai-architecture/00-scope-and-relationship-to-claude-framework.md`
  already flags `06-dev-workflow-and-claude-framework-overlay.md` as planned-but-not-drafted.
  Nothing about this task changes that status, but this task is itself a concrete
  example of the Standard Pipeline's Documentation stage producing per-feature docs
  (`Feature.md`/`Changes.md`/`DecisionLog.md`/`FutureWork.md`) alongside the
  architecture-blueprint tree for the first time — worth referencing when that overlay
  is eventually drafted, since it establishes where those pipeline outputs live
  (`docs/features/`, `docs/changes/`, `docs/DecisionLog.md`, `docs/FutureWork.md`).
