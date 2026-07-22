# Changes: 2026-07-19 — Phase 1 Catalog Core (product_service)

Last verified against commit: `f6115d1`

See `docs/features/product-catalog-core-phase1.md` for the full feature writeup and
`docs/DecisionLog.md` for the rationale behind the choices below.

## Summary

Added a real product taxonomy (manufacturers, brands, self-referencing categories,
collections, tags, controlled-vocabulary attributes) and product structure (variants,
images) to `product_service`, additively extending the existing flat `Product` table
rather than replacing it. This is Phase 1 of a 4-phase catalog redesign; only Phase 1 is
built. Zero changes were needed outside `product_service` and `libs/ecom_common` — the
`api_gateway` already proxied everything under `/products` and `/admin` to
`product_service` with the correct auth policies.

## Files Changed

| File | Change Type | Reason |
|---|---|---|
| `services/product_service/src/product_service/models.py` | Modified | Added `Manufacturer`, `Brand`, `Category`, `Collection`, `CollectionProduct`, `Tag`, `ProductTag`, `ProductAttribute`, `AttributeValue`, `ProductVariant`, `ProductVariantAttributeValue`, `ProductImage` models, `ProductStatus`/`VariantStatus`/`ImageKind` enums; extended `Product` with `title` (renamed from `product_name`), `slug`, `brand_id`/`manufacturer_id`/`category_id`, `status`, SEO fields, JSONB `attributes`, generated `search_document` tsvector, soft-delete/audit columns |
| `services/product_service/src/product_service/repo.py` | Modified | Added `BrandRepository`, `ManufacturerRepository`, `TagRepository`, `CollectionRepository`, `ProductAttributeRepository`, `AttributeValueRepository`, `ProductVariantRepository`, `ProductImageRepository`, `CategoryRepository` (with `get_children`/`get_subtree`); added `slugify`/`generate_unique_slug` helpers; extended `ProductRepository.build_catalog_query` with `brand_id`/`category_id`/`status` filters and `is_deleted` exclusion |
| `services/product_service/src/product_service/schemas.py` | Modified | Added Create/Update/Response Pydantic schemas for every new model; extended `ProductCreate`/`ProductUpdate`/`ProductResponse` with the new `Product` fields |
| `services/product_service/src/product_service/api/routes.py` | Modified | Added ~30 new endpoints under `/products` and `/admin/products` for taxonomy browse/CRUD, variants, images, collections, tags, attributes; changed `DELETE /products/{id}` from hard-delete to soft-delete; extended `ProductCreated`/`ProductUpdated`/`ProductDeleted` event payload with `slug`/`brand_id`/`category_id`/`manufacturer_id`/`status` and renamed `product_name` key to `title`; added `ProductVariantCreated` event publish on variant creation |
| `services/product_service/src/product_service/seeder.py` | Modified | Updated `_build_record` to target the renamed `title`/new `slug` columns (inserts via `Product.__table__`, so column names must match the migrated schema exactly) |
| `libs/ecom_common/src/ecom_common/events.py` | Modified | Added `EventType.PRODUCT_VARIANT_CREATED` |
| `services/product_service/alembic/versions/0003_catalog_taxonomy.py` | Added | Creates `manufacturers`, `brands`, `categories` (+ `ltree` extension, GiST expression index on `path::ltree`), `collections`, `collection_products`, `tags`, `product_tags` |
| `services/product_service/alembic/versions/0004_attribute_system.py` | Added | Creates `product_attributes`, `attribute_values` |
| `services/product_service/alembic/versions/0005_product_variants_and_images.py` | Added | Creates `product_variants`, `product_variant_attribute_values`, `product_images` |
| `services/product_service/alembic/versions/0006_product_catalog_columns.py` | Added | Renames `products.product_name` → `title`; adds `slug` (backfilled for ~3271 existing rows), `brand_id`/`manufacturer_id`/`category_id`, `status`, SEO fields, `attributes` (JSONB), generated `search_document` (tsvector), soft-delete/audit columns |

## Breaking Changes

- **`products.product_name` → `products.title`.** A plain column rename (`ALTER TABLE
  ... RENAME COLUMN`), not a new column with a compatibility shim — see
  `docs/DecisionLog.md`. Anything reading the `products` table via raw SQL rather than
  through `product_service`'s ORM/API would break; nothing in this codebase does that
  today per a grounding check of consumers, but this is worth re-verifying before
  Phase 2.
- **`DELETE /products/{id}` no longer hard-deletes.** Externally invisible (the row
  still 404s afterward), but the row is retained (`is_deleted = true`) rather than
  removed. Anything depending on the row actually disappearing from the table (e.g. a
  count query against `products` without an `is_deleted` filter, or a compliance
  hard-delete requirement) would observe different behavior. See
  `docs/DecisionLog.md`.
- **Event payload key rename:** the `ProductCreated`/`ProductUpdated`/`ProductDeleted`
  event payload's `product_name` key is now `title`, and several new keys
  (`brand_id`/`category_id`/`manufacturer_id`/`status`/`slug`) were added. No consumer
  currently subscribes to `Topics.PRODUCT` per a grounding check, so this is a
  breaking-in-theory, not breaking-in-practice change today.

## Migration Steps Required

1. Run Alembic migrations `0003` → `0006` in order against `product_db` before
   deploying the new `product_service` code (standard expand-then-deploy; see
   `docs/features/product-catalog-core-phase1.md` → Rollout Plan).
2. No data backfill is required or performed for `brand_id`/`category_id`/
   `manufacturer_id` in this change set — those remain `NULL` on all existing rows by
   design (deferred; see `docs/DecisionLog.md`).
3. No `api_gateway` redeploy is required — the route table already proxies
   `/products*` and `/admin*` to `product_service`.
4. See `services/product_service/alembic/versions/0006_product_catalog_columns.py` for
   the full per-revision migration detail (a dedicated `Migration.md` was not produced
   separately for this change set since the four revisions are additive/low-risk and
   are fully documented inline in their own docstrings and in this Changes entry).

## Rollback Plan

- Each of the four new Alembic revisions has a matching `downgrade()` that reverses it
  exactly (drops the new tables/columns/indexes in dependency order; `0006` renames
  `title` back to `product_name`). Standard `alembic downgrade 0002` reverts all four in
  sequence.
- Because every change is additive, rolling back the **code** without rolling back the
  **schema** is also safe: pre-Phase-1 `product_service` code only reads/writes the
  columns it always knew about and ignores the new ones.
- Rolling back the schema (`alembic downgrade`) while Phase-1 code is still deployed is
  **not** safe — the new code depends on the new columns/tables and will error. Roll
  back code first, then schema, if a full rollback is needed.
