# Feature: Phase 1 Catalog Core Redesign (`product_service`)

Last verified against commit: `f6115d1`

**Grounding:** Built. Everything described below is shipped code in `product_service`
(port 8003, `product_db`), not a proposal. Where this doc says "deferred" or "later
phase," that is explicitly *not* built yet — see Known Limitations.

Related docs: `docs/changes/2026-07-19-product-catalog-core-phase1.md` (file-level
changelog), `docs/DecisionLog.md` (rationale for the tradeoffs below),
`docs/FutureWork.md` (Phase 2–4 and other deferred work),
`docs/ai-architecture/03-domain-model/02-catalog.md` (updated domain-model doc for
Product/Category/Brand, now all tagged Built).

## Summary

`product_service` owned a single flat `Product` table: descriptive metadata, one price,
and category/sub-category/brand as free-text strings on the row itself. That shape
worked for a single-seller demo catalog but cannot support a real multi-seller
marketplace — it conflates catalog *content* (title, description, images) with a
*single seller's* price, and it has no real taxonomy: two rows with `category = "Gaming"`
and `category = "gaming "` are, as far as the database is concerned, unrelated
categories.

Phase 1 ("Catalog Core") is the first of four planned phases to fix this
(Catalog core → Marketplace split → Inventory re-key → Cleanup; only Phase 1 is
approved and built so far). It adds a real taxonomy and product-structure layer
entirely within `product_service`'s own database — no other service's schema or the
`api_gateway` needed to change, because this repo is a per-service-database
microservices architecture and `product_service` already owned everything Phase 1
touches.

## User-Facing Behavior

- **Shoppers (public `GET` endpoints):** can now browse a real category tree
  (`GET /products/categories`, `.../categories/{id}/subtree`), browse brands and
  manufacturers, browse curated collections (`GET /products/collections/{id}/products`),
  and filter product listings by `brand_id`/`category_id` in addition to the existing
  free-text `category`/`sub_category`/`brand` filters. Product detail responses now
  include a `slug`, `status`, SEO fields, and a structured `attributes` bag.
- **Sellers:** can attach variants (size/color-style SKUs with their own barcode/UPC/EAN,
  dimensions, warranty, etc.) and images to their own products, gated by the same
  ownership rule as product mutation (`seller_id` match or `ADMIN`).
- **Admins:** get a full CRUD surface for the new taxonomy — manufacturers, brands,
  categories (create + move-free update + delete with dependent-record checks), tags,
  collections (including adding/removing products), attributes and their controlled
  vocabulary of values.
- **Everyone:** `DELETE /products/{id}` now soft-deletes. From the outside this is
  invisible — a soft-deleted product still 404s on every read path — but the row and its
  variants/images/collection memberships are preserved rather than destroyed.

## Technical Summary

- **Frontend changes:** None — this is a backend-only phase. No frontend repo/module
  was touched.
- **Backend changes:**
  - `services/product_service/src/product_service/models.py` — 10 new SQLAlchemy
    models (`Manufacturer`, `Brand`, `Category`, `Collection`, `CollectionProduct`,
    `Tag`, `ProductTag`, `ProductAttribute`, `AttributeValue`, `ProductVariant`,
    `ProductVariantAttributeValue`, `ProductImage`) plus an additively-extended
    `Product` model.
  - `services/product_service/src/product_service/repo.py` — new repositories for each
    new model, `slugify`/`generate_unique_slug` helpers, and `CategoryRepository`'s
    `get_children`/`get_subtree` (the latter using a raw-SQL `ltree` cast — see
    `docs/DecisionLog.md`).
  - `services/product_service/src/product_service/schemas.py` — Create/Update/Response
    Pydantic schemas for every new model.
  - `services/product_service/src/product_service/api/routes.py` — roughly 30 new REST
    endpoints (taxonomy browse + admin CRUD, variants, images, collections, tags,
    attributes), all nested under the existing `/products` (public `GET`, seller/admin
    mutate) and `/admin/products` prefixes already registered in
    `services/api_gateway/src/api_gateway/route_table.py` — **zero `api_gateway`
    changes were needed.**
  - `services/product_service/src/product_service/seeder.py` — updated to target the
    renamed `title`/new `slug` columns (the CSV seeder's `_build_record` output maps
    directly onto `Product.__table__` columns).
  - `libs/ecom_common/src/ecom_common/events.py` — added
    `EventType.PRODUCT_VARIANT_CREATED`.
- **Data model changes:** see the Migration section below and
  `docs/ai-architecture/03-domain-model/02-catalog.md` for the full domain-model
  writeup (aggregates, invariants, relationships).

## Impacted Files

See `docs/changes/2026-07-19-product-catalog-core-phase1.md` for the complete
file-level table.

## Configuration / Feature Flags

None introduced. No new settings, environment variables, or feature flags — the new
endpoints are unconditionally available once the migrations run.

## Rollout Plan

- **Migrations:** four new additive Alembic revisions,
  `services/product_service/alembic/versions/0003_catalog_taxonomy.py` through
  `0006_product_catalog_columns.py`, applied in sequence on top of the existing
  `0001_baseline_products`/`0002_widen_text_columns`. Every new `NOT NULL` column uses a
  constant `server_default` (never computed), so on Postgres 11+ these are
  metadata-only changes — no full-table rewrite beyond the brief `ACCESS EXCLUSIVE` lock
  needed to alter the catalog. The one genuinely per-row operation is the `slug`
  backfill in `0006` (a Python loop over the existing ~3271 seeded rows) — fine for a
  one-time migration at this data volume, but worth knowing if the seeded catalog grows
  by orders of magnitude before Phase 1-equivalent work is done again elsewhere.
- **Backward compatibility:** fully additive. Every pre-existing column, endpoint, and
  event payload field that existed before Phase 1 still exists and still means the same
  thing. The one behavior change is `DELETE /products/{id}` switching from hard-delete
  to soft-delete — externally invisible (still 404s), but operationally different if
  anyone was relying on the row actually disappearing (e.g. a compliance "right to be
  forgotten" workflow would need a real hard-delete path, which does not exist for
  Product post-Phase-1).
- **Deployment order:** run the four new Alembic migrations before deploying the new
  `product_service` code (standard expand-then-deploy; the new columns/tables are
  additive so the old code continues to run correctly against the new schema during any
  rolling-deploy window).
- **No cross-service coordination required:** `product_db` is private to
  `product_service`; nothing else needed to be migrated in lockstep.

## Known Limitations

Explicit scope cuts for this phase — all tracked in detail in `docs/FutureWork.md`:

- **Legacy free-text columns not backfilled.** `Product.brand_id`/`category_id`/
  `manufacturer_id` are nullable and are **not** populated from the existing
  `Product.brand`/`category`/`sub_category` free-text values on any of the ~3271
  pre-existing seeded rows. Taxonomy-based filtering (`brand_id`/`category_id` query
  params) currently returns nothing for the legacy catalog until a backfill/dedup pass
  runs in a later phase.
- **No category rename/re-parent.** `CategoryUpdate` only allows toggling
  `is_active`/`sort_order`. Renaming a category or moving it to a different parent would
  require recomputing `slug`/`path`/`depth` for its entire subtree, which is not
  implemented.
- **No marketplace split.** Price (`retail_price`/`discount`) and `seller_id` still live
  directly on `Product`, meaning one product row still represents exactly one seller's
  listing rather than shared catalog content with per-seller offers. That split is
  Phase 2.
- **No inventory re-key.** `inventory_service` still keys off `Product.id`, not the new
  `ProductVariant.id`, even though variants (which are the natural SKU-level unit for
  stock) now exist. That re-key is Phase 3.
- **No legacy-column drop.** The old `category`/`sub_category`/`brand` columns on
  `Product` are untouched and still fully functional (existing filters/sort still work
  identically) — dropping them once everything reads from the new FKs is Phase 4.
- **`Brand`/`Manufacturer`/`Category`/`Tag`/`Collection` deletes are hard deletes,** not
  soft deletes like `Product` — see `docs/DecisionLog.md` for why soft-delete was scoped
  to `Product` only in this phase.
