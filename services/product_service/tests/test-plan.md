# Test Plan: Phase 1 Catalog Core (product_service DDD normalization)

## Scope

Covers the Phase 1 catalog redesign in `product_service`: new taxonomy tables
(`Brand`, `Manufacturer`, `Category`, `Collection`, `Tag`, `ProductAttribute`,
`AttributeValue`, `ProductVariant`, `ProductImage`) and the additive extension
of `Product` (taxonomy FKs, `slug`, `status`, soft-delete/audit columns, SEO
fields, JSONB `attributes`, generated `search_document`). `product_service`
had zero tests before this change; this plan establishes the suite from
scratch, prioritizing correctness-critical / easy-to-regress behavior
(soft-delete, ownership, RBAC, hierarchy, uniqueness, variant validation)
over exhaustive CRUD coverage of every field.

Because the schema depends on Postgres-only features (`JSONB`, `ARRAY`, a
`Computed` STORED generated column, and ltree-cast subtree queries), almost
everything below that touches the DB is an **integration** test against a
real Postgres instance (see `tests/integration/conftest.py`), not a SQLite
unit test — SQLite cannot represent this schema at all (`CREATE TABLE` for
`products` fails on the `JSONB`/`ARRAY`/`Computed` columns). Pure-Python logic
with no DB dependency (`_build_record`, `slugify`) is still unit-tested.

## Unit Tests
| Test | File Under Test | Case | Expected |
|---|---|---|---|
| `test_build_record_valid_row` | `seeder._build_record` | well-formed CSV row | dict with `title`/`slug` keys populated, no `product_name` key |
| `test_build_record_missing_title_returns_none` | `seeder._build_record` | row with blank/missing `title` | returns `None` |
| `test_build_record_bad_price_defaults_to_zero` | `seeder._build_record` | non-numeric `price`/`discount`/`rating` | `Decimal("0")`, no exception |
| `test_build_record_slug_deterministic_and_unique_suffix` | `seeder._build_record` | same title, category, price twice | same `uniq_id`; `slug` includes the `uniq_id` prefix so two calls don't collide |
| `test_slugify_variants` | `repo.slugify` | mixed case, punctuation, empty string, `sep="_"` | lowercased, non-alnum collapsed to separator, empty input -> `"item"` |

## Integration Tests
| Test | Boundary Covered | Case | Expected |
|---|---|---|---|
| `test_soft_delete_hides_product_but_keeps_row` | API route -> repo -> DB | `DELETE /products/{id}` then `GET /products/{id}` | 204 delete; row still present with `is_deleted=True`/`deleted_at`/`deleted_by` set; subsequent GET 404 |
| `test_soft_deleted_product_excluded_from_list` | `GET /products` | soft-deleted product among others | excluded from `products` list results |
| `test_soft_deleted_product_variants_and_images_unreachable` | nested variant/image GET | product soft-deleted, has variant+image | `GET /products/{id}/variants` and `/images` 404 (product itself 404s first) |
| `test_seller_forbidden_on_other_sellers_product_variant_create` | ownership check | seller A creates variant on seller B's product | 403 |
| `test_seller_forbidden_on_other_sellers_product_image_create` | ownership check | seller A creates image on seller B's product | 403 |
| `test_variant_id_mismatched_product_id_returns_404` | nested resource scoping | `GET /products/{p2}/variants/{variant_of_p1}` | 404, not p1's variant data |
| `test_image_id_mismatched_product_id_returns_404` | nested resource scoping | `GET`-equivalent (delete) `/products/{p2}/images/{image_of_p1}` | 404 |
| `test_admin_only_endpoints_reject_seller` | RBAC | seller calls brand/manufacturer/category/tag/collection/attribute create | 403 for each |
| `test_admin_only_endpoints_allow_admin` | RBAC | admin calls same endpoints | 201 |
| `test_category_child_computes_path_and_depth` | `create_category` | create parent then child then grandchild | `path` dot-joins slugs, `depth` increments per level |
| `test_category_subtree_multilevel` | `CategoryRepository.get_subtree` (ltree `<@`) | 3-level tree (root/child/grandchild) plus sibling branch | subtree of root returns all 3 descendants + itself, not the sibling branch |
| `test_delete_category_with_children_conflicts` | `delete_category` | category has a child | 409, category not deleted |
| `test_delete_category_with_products_conflicts` | `delete_category` | category referenced by a product | 409, category not deleted |
| `test_delete_leaf_empty_category_succeeds` | `delete_category` | no children, no products | 204 |
| `test_duplicate_brand_name_conflicts` | `_create_or_conflict` | two brands, same name different slug | 409 |
| `test_duplicate_brand_slug_conflicts` | `_create_or_conflict` | two brands, same slug different name | 409 |
| `test_duplicate_category_name_under_same_parent_conflicts` | `_create_or_conflict` | two categories, same `name`+`parent_id` | 409 |
| `test_same_category_name_different_parent_succeeds` | `create_category` | same name, different `parent_id` | 201 (no conflict) |
| `test_second_primary_image_conflicts` | partial unique index `uq_product_images_primary` | two `PRIMARY` images, same product/variant | first 201, second 409 |
| `test_primary_image_per_variant_is_independent` | same index | `PRIMARY` image for product-level and for a specific variant | both succeed (different partial-index key) |
| `test_duplicate_barcode_conflicts` | partial unique index on `barcode` | two variants, same barcode | first 201, second 409 |
| `test_duplicate_upc_conflicts` / `test_duplicate_ean_conflicts` | same pattern | upc / ean | 409 |
| `test_null_barcode_does_not_conflict` | partial unique index | two variants, both `barcode=None` | both succeed (partial index excludes NULLs) |
| `test_variant_rejects_nonexistent_attribute_value_id` | `create_variant` validation | `attribute_value_ids=[999999]` | 422 |
| `test_variant_rejects_non_variant_defining_attribute` | `create_variant` validation | attribute value on an attribute with `is_variant_defining=False` | 422 |
| `test_variant_accepts_valid_variant_defining_combination` | `create_variant` | valid attribute value ids on a variant-defining attribute | 201; `product_variant_attribute_values` join rows exist for each id |
| `test_create_product_autogenerates_slug_from_title` | `create_product` | payload omits `slug` | response slug is `slugify(title)` |
| `test_create_product_explicit_slug_used_as_is` | `create_product` | payload includes `slug` | response slug equals payload (no disambiguation attempted on create) |
| `test_create_product_duplicate_slug_conflicts` | `_create_or_conflict` | two products, explicit identical slug | first 201, second 409 |
| `test_update_product_duplicate_slug_conflicts` | `_update_or_conflict` | update product B's slug to product A's existing slug | 409 |
| `test_search_document_populated_after_insert` | generated column | create product with title+description | `search_document` (raw SQL check) is non-null tsvector containing a title token |
| `test_legacy_fields_round_trip` | `ProductCreate`/`ProductResponse` | create with `category`/`sub_category`/`brand`/`retail_price`/`discount` free-text legacy fields | values returned unchanged on create and subsequent GET |
| `test_new_product_defaults_to_draft_status` | ORM default vs DB server_default | create via API without `status` in payload | `status == "DRAFT"` (ORM-side Python default wins over the `PUBLISHED` DB server_default meant for legacy backfilled rows) |

## E2E Tests
| Test | User Flow | Expected |
|---|---|---|

None added. No new critical end-to-end user journey is in scope for this
phase — Phase 1 is an internal schema/API normalization, not a new
user-facing flow, and the sibling services in this repo don't yet have E2E
tooling wired up for product_service to reuse.

## Edge Cases
| Case | Why It Matters | Covered By |
|---|---|---|
| Soft-deleted product's nested variants/images | soft-delete must fully hide the product subtree, not just the product record | `test_soft_deleted_product_variants_and_images_unreachable` |
| Cross-product nested-resource id confusion | must not leak another seller's variant/image data via id-guessing | `test_variant_id_mismatched_product_id_returns_404`, `test_image_id_mismatched_product_id_returns_404` |
| NULL vs duplicate value in partial unique indexes (barcode/upc/ean/PRIMARY image) | partial indexes only apply `WHERE x IS NOT NULL` / `WHERE kind='PRIMARY'` — easy to accidentally over- or under-constrain | `test_null_barcode_does_not_conflict`, `test_primary_image_per_variant_is_independent` |
| Category deletion with children vs with product references | two independent 409 guards in `delete_category`, must not conflate | `test_delete_category_with_children_conflicts`, `test_delete_category_with_products_conflicts` |
| Deep category subtree (3+ levels) plus a sibling branch | proves the ltree `<@` predicate actually walks descendants and doesn't just do a flat parent_id match, and doesn't false-positive on siblings | `test_category_subtree_multilevel` |
| Non-variant-defining attribute passed to variant create | must reject at the domain-validation layer (422), not silently accept or 500 | `test_variant_rejects_non_variant_defining_attribute` |
| `status` ORM default vs DB `server_default` mismatch (DRAFT vs PUBLISHED) | a genuinely surprising divergence in the migration; worth a regression-style assertion so it isn't "fixed" into inconsistency later | `test_new_product_defaults_to_draft_status` |

## Regression Guards

No bug fix preceded this task (this is new-feature test coverage for a
freshly implemented redesign, not a debug/fix task), so there are no
regression tests in the "guard a previously broken behavior" sense. The
`status` default-mismatch test above is the closest thing to a regression
guard: it pins down a real (and non-obvious) divergence between the ORM
default and the migration's `server_default` so a future refactor can't
silently change it without a test failing.

## Out of Scope

- Phase 2/3 concepts (`SellerListing`, `Pricing`, `Inventory` re-key) — do
  not exist yet in this codebase, not tested.
- Full CSV `seed_from_csv` end-to-end run (batch insert, `ON CONFLICT DO
  NOTHING` dedupe, fallback-to-row-by-row on batch failure) — only the pure
  `_build_record` normalization function is unit tested, per the task's
  explicit instruction to keep this focused rather than running a full CSV
  seed in tests.
- `ProductUpdate` field-by-field exhaustive coverage for every column (SEO
  fields, `meta_keywords`, etc.) beyond what's needed to prove the
  create/update/conflict/legacy-round-trip contracts — would be repetitive
  CRUD coverage without much additional risk reduction.
- Kafka event publishing (`publish_product_event`, `publish_variant_created_event`)
  — these already swallow all exceptions by design (best-effort) and are
  wired to `AsyncMock()` in the test app exactly like inventory_service's
  suite; not independently asserted here since there's no new behavior in
  this phase's diff to those functions.
- Load/performance testing of the new GIN/GiST indexes.
