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

## Backlog Items Identified During This Task (HLD/LLD Generation, 2026-07-22)

| Item | Category (Perf/Debt/Feature/Security/DX) | Priority | Rationale |
|---|---|---|---|
| No API path exists to transition `Product.status` out of `DRAFT` | Feature/Debt | **Critical** | `ProductCreate`/`ProductUpdate` have no `status` field and no handler mutates it post-creation. Combined with the (correct) Phase 1 fix restricting public reads to `status == PUBLISHED`, every product created via `POST /products` since that fix shipped is **permanently invisible** to the public catalog — there is no seller-submit/admin-approve/direct-publish endpoint of any kind. Surfaced while drafting `docs/services/product-service/diagrams/e2e-product-lifecycle.md`. Needs a moderation-workflow design decision (self-publish vs. admin-approval) before implementation, not a quick patch. See that diagram's Notes for full detail. |

## Backlog Items Identified During This Task (python/ Consolidation + Root Cleanup, 2026-07-24)

| Item | Category (Perf/Debt/Feature/Security/DX) | Priority | Rationale |
|---|---|---|---|
| Real observability (Prometheus/Grafana or equivalent) is now fully unwired | Feature | Low | `prometheus/prometheus.yml` was removed (unreferenced by any compose file, and factually stale — wrong ports, referenced a nonexistent `order-service`). Every service already exposes `/metrics` via `prometheus-fastapi-instrumentator` (see `ecom_common.bootstrap`), so scraping is one correctly-configured `prometheus.yml` + compose service away whenever observability is actually prioritized — not starting from zero. |
| Two Postman collections existed with real content drift (wrong ports, `{{jwt_token}}` vs `{{access_token}}`) before one was deleted | DX | Low (resolved for now) | `docs/postman_collection.json` (kept, current) vs. `docs/postman/` (deleted, stale) had silently diverged. Worth a lightweight process note (e.g. "regenerate from FastAPI routers, don't hand-edit") so a second stale copy doesn't reappear. |

## Backlog Items Identified During This Task (Monorepo Restructure + CI/CD Scaffold, 2026-07-24)

| Item | Category (Perf/Debt/Feature/Security/DX) | Priority | Rationale |
|---|---|---|---|
| Wire real CD (`cd-deploy.yml`) to the EKS cluster | Feature | Medium | Currently a `workflow_dispatch`-only stub with no real deploy logic. Needs: `terraform/eks.tf` filled out (ECR repos, IAM roles, k8s Deployments/Services/Ingress, remote state backend — currently a bare VPC+EKS stub with no `variables.tf`/backend config), GitHub OIDC → AWS IAM role federation (not static credentials), then replacing the stub step with `terraform apply`/`helm upgrade`/`kubectl rollout`. |
| Configure branch protection / repository rulesets for `main` | DX | High | Cannot be done from a coding session — needs a human in GitHub Settings. Select the specific job-level check names surfaced by the first real workflow runs (e.g. `lint-test / lint`, `docker / build`). Watch for the known GitHub gotcha where a path-filtered required check that never triggers on a given PR can block it indefinitely; prefer repository rulesets over classic branch-protection required-checks if this manifests. |
| Pre-existing `inventory_service` unit-test failures under full-workspace `pytest` run | Debt/Test | Medium | Discovered (not introduced) while validating this restructure: `uv --directory python run pytest libs services -m "not integration and not e2e" -q` produces 2 failed + 73 errors, all in `python/services/inventory_service/tests/unit/`, but every one of those tests passes when run in isolation — a test-isolation/fixture-pollution issue that surfaces only when the full workspace suite runs together. Confirmed present on `master` before this restructure (verified via a throwaway worktree), so it is unrelated to the folder/CI changes. The new `ci-inventory-service.yml` pipeline will fail its `test` job on first run because of this — needs its own root-cause investigation (likely shared event-loop or DB-fixture state leaking across test files) before that pipeline can go green. |
| `uv.lock` is deliberately excluded from every CI trigger's `paths:` filter | Debt (accepted) | Low | Necessary to preserve per-component CI independence (a single shared workspace lockfile would otherwise fan out every dependency bump to all 5 pipelines), but means a rare transitive-dependency shift in one service's resolution — caused by an unrelated service's dependency bump — wouldn't be caught by CI until that other service's code next changes for an unrelated reason. Documented tradeoff, not an oversight; revisit only if this actually causes a real incident. |
| Reconcile Makefile with the new CI (`make` has a phantom `.PHONY: build` with no recipe, and no target runs `-m e2e` despite the marker existing and the README describing one) | DX | Low | Noticed while building the CI pipelines but out of scope for this pass (CI workflows don't currently reuse Makefile targets, they call `uv`/`npm`/`pytest` directly) — worth cleaning up so local dev and CI stay conceptually aligned. |
| No `apps/ecom-web` CI job runs the frontend's *actual* backend-integration e2e path | Feature/Test | Low | `ci-ecom-web.yml`'s `e2e` job runs the existing self-contained Playwright spec only (no live backend). A real cross-component e2e suite would need to orchestrate the full docker-compose stack — a deliberate coupling across all 5 otherwise-independent pipelines, worth its own design discussion when the Playwright suite has enough real backend-dependent specs to justify it. |

## Backlog Items Identified During This Task (Full Catalog Seed Generator, 2026-07-22)

| Item | Category (Perf/Debt/Feature/Security/DX) | Priority | Rationale |
|---|---|---|---|
| Move catalog auto-seed off the inline-awaited lifespan path | Perf/DX | High | `AUTO_SEED_ON_STARTUP=true` makes the whole app process unreachable (not just "not ready") for the duration of a cold-empty-DB seed (~6s+ empirically, likely more under real fsync/WAL conditions in production). This was a deliberate, explicitly-flagged tradeoff — see `docs/DecisionLog.md`, "Seed inline in the lifespan before `yield`" — not a bug. Currently latent (nothing in this compose stack depends on `product-service`'s health today), but would surface as intermittent boot failures the moment a healthcheck/orchestrator dependency is added on top of this service. Fix options: background task + readiness-check integration (`/health/ready` reports not-ready until seeding completes, app still accepts connections), or move seeding to a pre-start init step outside the app process entirely (the architecturally cleaner long-term answer, matching how Alembic migrations are already expected to run ahead of the app). |
| Reconsider `docker-compose.yml`'s `AUTO_SEED_ON_STARTUP=true` dev default | DX/Debt | Medium | Given the above, every `docker compose up` from a clean volume currently pays the full inline-seed unreachability window by default. Worth reconsidering once the fix above lands — e.g. default to `false` and document the manual `POST /admin/catalog/seed` call as the recommended first-run step, or keep `true` only once seeding is backgrounded and no longer blocks reachability. |
| Give `ProductVariant`/`ProductImage` a real natural/business unique key | Debt/Feature | Medium | Both tables have no natural key even outside the seeding context — the full-catalog seeder works around this by having the generator assign explicit deterministic ids (see `docs/DecisionLog.md`, "generator-assigned deterministic ids"). A future real bulk-upload feature (sellers uploading their own variant/image data) would hit the same idempotency gap and can't reuse the generator's trick, since it doesn't control ids ahead of time. Likely candidate: a required `sku` on `ProductVariant`; images may be harder to key naturally (no obvious content-derived identity) and might need a different mechanism (e.g. client-supplied idempotency key). |
| Dedicated seed-completion marker (small state table) | Debt/DX | Low | `seed_full_catalog`'s fast-path skip currently checks `product_images`' row count (the last-loaded table) as a proxy for "fully seeded" — deliberately chosen over checking the first table so a crash mid-seed never permanently freezes the catalog half-seeded (see `docs/DecisionLog.md`). It's a heuristic, not a guarantee (e.g. a database manually seeded only for `product_images` would be misread as fully seeded). A small `catalog_seed_runs`-style table with an explicit `completed_at` would be a more precise signal; not built now because the row-count heuristic is good enough at current scale and usage patterns. |

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
