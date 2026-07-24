# Cluster 02: Catalog

Last verified against commit: `f6115d1`

Domains: Product (Built), Category (Built), Brand (Built).

All three map to `product_service` (port 8003, `product_db`). Category and Brand were
promoted from Conceptual-only to Built by the **Phase 1 Catalog Core redesign**
(migrations `0003_catalog_taxonomy.py` through `0006_product_catalog_columns.py`) — see
`docs/features/product-catalog-core-phase1.md` for the full feature writeup and
`docs/DecisionLog.md` for the rationale behind the migration strategy. That same redesign
also introduced `Manufacturer` (a Built aggregate `Brand` optionally references via
`manufacturer_id`) plus `Collection`, `Tag`, `ProductAttribute`/`AttributeValue`,
`ProductVariant`, and `ProductImage` — all real tables in `product_db` today, but not
broken out as their own domain-catalog rows in this pass since they are supporting/child
data of the Product aggregate rather than independent bounded contexts. Marketplace
concerns (per-seller pricing/listings), inventory re-keying onto `ProductVariant`, and
backfilling the legacy `category`/`sub_category`/`brand` free-text columns into the new
FKs are explicitly deferred — see Known Limitations in the feature doc.

---

## Domain: Product

### Overview
- **Bounded Context:** `product_service`
- **Maturity Tag:** Built
- **Grounding:** `python/services/product_service/src/product_service/models.py::Product`
- **Phase 1 extension (Built):** `title` (renamed from `product_name`), a unique `slug`,
  nullable `brand_id`/`manufacturer_id`/`category_id` FKs, a `status` lifecycle enum
  (`DRAFT`/`PENDING_APPROVAL`/`PUBLISHED`/`REJECTED`/`ARCHIVED`/`DISCONTINUED`), SEO
  fields, a JSONB `attributes` bag, a generated (`STORED`) full-text `search_document`
  tsvector, and soft-delete/audit columns (`is_deleted`/`deleted_at`/`deleted_by`/
  `created_by`/`updated_by`/`version`) — all additive; the legacy `category`/
  `sub_category`/`brand` free-text columns are untouched and not backfilled into the new
  FKs yet

### Business Responsibilities
- Own the sellable catalog item: identity, descriptive metadata, price, and a
  denormalized rating/review-count pair.
- Enforce that only the recorded owning Seller (or an Admin) can modify or delete a
  Product.
- Publish catalog change events so other services (Inventory today; Search in the
  future per the internal backfill endpoints already present) can react without needing
  to poll `product_service` directly.

### Aggregate Roots
| Aggregate | Identity | Invariants it enforces |
|---|---|---|
| Product | `id: int` (also `uniq_id: str`, a separate unique external identifier) | `seller_id`, if set, controls who may mutate/delete; `retail_price`/`discount`/`rating` are `Numeric`, not float, to avoid precision drift; `slug` is globally unique (server-generated via `generate_unique_slug` if omitted); `DELETE /products/{id}` soft-deletes (`is_deleted`/`deleted_at`/`deleted_by`) rather than removing the row — see `docs/DecisionLog.md` |

### Entities
| Entity | Belongs to Aggregate | Notes |
|---|---|---|
| *(none — Product has no child entities today; category/brand/sub_category are flat fields, not related entities)* | — | — |

### Value Objects
| Value Object | Shape | Notes |
|---|---|---|
| Money (retail_price, discount) | `Decimal(12, 2)` | Modeled as `Numeric` explicitly to avoid the float-precision issues the code comment calls out as a fix over an earlier flat model |
| Rating | `Decimal(3, 2)` | Denormalized average; no Reviews service exists to be the source of truth yet — see the Reviews domain (cluster 08) |

### Domain Services
- Catalog query building (`ProductRepository.build_catalog_query` — filter by
  category/sub_category/brand/price range, sort by id/price/-price/rating/name/newest).

### Application Services
- Create/Update/Delete Product (`api/routes.py`) — role-gated (`SELLER`/`ADMIN`),
  ownership-checked on update/delete.
- `seed_from_csv` (`seeder.py`) — admin-only bulk import, invoked via
  `POST /admin/products/seed`.

### Repository Interfaces
- `ProductRepository` (`repo.py`), built on `ecom_common`'s generic repository base —
  the pattern `inventory_service` also follows.

### Domain Events
| Event | Trigger | Maturity |
|---|---|---|
| `ProductCreated` | `POST /products` | Built — published to `Topics.PRODUCT`, best-effort (publish failure is logged, never fails the write) |
| `ProductUpdated` | `PUT /products/{id}` | Built, same topic/semantics |
| `ProductDeleted` | `DELETE /products/{id}` (soft-delete; event still fires) | Built, same topic/semantics |
| `ProductVariantCreated` | `POST /products/{id}/variants` | Built — published to `Topics.PRODUCT`, same best-effort semantics, partitioned by `product_id` |

Payload for `ProductCreated`/`ProductUpdated`/`ProductDeleted` carries `product_id`,
`title` (renamed from `product_name`), `slug`, `description`, `brand`, `category`,
`sub_category`, `retail_price`, `discount`, `rating`, `review_count`, `image_urls`,
`brand_id`, `category_id`, `manufacturer_id`, `status` — i.e. the full denormalized
snapshot a consumer would need without calling back into `product_service`, now
including the Phase 1 taxonomy FKs alongside the still-present legacy free-text fields.
`ProductVariantCreated`'s payload carries `variant_id`, `product_id`, `variant_name`,
`attributes`.

### Commands
- CreateProduct, UpdateProduct, DeleteProduct — all require `SELLER` or `ADMIN`.
- SeedProductsFromCsv — `ADMIN` only.

### Queries
- ListProducts (paginated, filterable, sortable, cached per-request-shape is not
  applied — only single-product `GetProduct` is Redis-cached).
- GetProduct — Redis-cached (`cache:product:{id}`, TTL from `product_cache_ttl_seconds`).
- Internal: `GET /internal/products/{id}` and `GET /internal/products` (paged dump) —
  documented in-code as existing for cart price snapshots and search backfill, neither
  of which currently exists as a consumer.

### Relationships to Other Domains
| Domain | Relationship | Direction | Notes |
|---|---|---|---|
| Inventory | Inventory rows reference `product_id` with no DB-level FK (separate databases); Inventory is the only real consumer of Product's existence today | Product → Inventory | Referential integrity is application-layer only |
| Seller | `Product.seller_id` is the ownership key | Seller → Product | See cluster 01 |
| Category, Brand | Product carries **both** the legacy flat text fields (`category`/`sub_category`/`brand`) **and** nullable FKs (`category_id`/`brand_id`) to the now-Built Category/Brand aggregates below — the FKs are not backfilled from the legacy text on any of the ~3271 pre-existing seeded rows (deferred, see `docs/DecisionLog.md`) | Category/Brand → Product | See below |
| Manufacturer | `Product.manufacturer_id` (nullable FK); also referenced independently by `Brand.manufacturer_id` | Manufacturer → Product, Manufacturer → Brand | Not broken out as its own domain-catalog row in this pass — see the cluster-level note above |
| Reviews (Reserved-in-infra) | `rating`/`review_count` are pre-built denormalized targets a future Reviews service would update | Reviews → Product | No consumer exists yet; Product does not currently subscribe to `Topics.REVIEW` |
| Search (Reserved-in-infra) | `GET /internal/products` exists specifically "for the search-service backfill" per its own docstring | Product → Search | No Search service exists to call it |

### Open Questions / Design Gaps
- The legacy `category`/`sub_category`/`brand` free-text columns are now redundant with
  `category_id`/`brand_id`, but nothing yet enforces or backfills consistency between
  them — a product could have `brand = "Ant Esports"` and `brand_id` pointing at an
  unrelated Brand row, or `brand_id` set with `brand` left null. Resolving this
  (backfill + eventual column drop) is Phase 4 work, not designed here.
- Marketplace split (per-seller pricing/listings distinct from shared catalog content)
  and re-keying `inventory_service` onto `ProductVariant` instead of `Product` are
  Phase 2/3 work, not designed here — see `docs/FutureWork.md`.

---

## Domain: Category

### Overview
- **Bounded Context:** `product_service`
- **Maturity Tag:** Built (promoted from Conceptual-only by Phase 1 Catalog Core)
- **Grounding:** `python/services/product_service/src/product_service/models.py::Category`,
  migration `0003_catalog_taxonomy.py`. The legacy `Product.category`/`Product.sub_category`
  free-text columns still exist unchanged alongside the new `categories` table and
  `Product.category_id` FK — see the Product domain's Relationships/Open Questions above.

### Business Responsibilities
- Provide a controlled, self-referencing hierarchical classification
  (`categories.parent_id`) that `Product.category_id` can reference instead of (or
  alongside, for now) embedding free text.
- Support indexed ancestor/descendant ("subtree") lookups via a materialized `path`
  column, without requiring recursive CTEs at query time.
- Prevent duplicate siblings: `UniqueConstraint("parent_id", "name")` stops two
  categories with the same name under the same parent.

### Aggregate Roots
| Aggregate | Identity | Invariants it enforces |
|---|---|---|
| Category | `id: int` | `parent_id`, if set, must reference an existing Category; `(parent_id, name)` unique; `slug` globally unique; `path`/`depth` are derived, not independently settable — computed at creation time from the parent's `path`/`depth` |

### Entities
| Entity | Belongs to Aggregate | Notes |
|---|---|---|
| *(none — Category is self-referencing rather than having a distinct child entity; there is no separate `SubCategory` table)* | — | — |

### Value Objects
| Value Object | Shape | Notes |
|---|---|---|
| `path` | dot-separated, underscore-joined slug string (e.g. `electronics.mobiles_and_accessories.smartphones`) | Deliberately a plain `String` column, not a native SQLAlchemy/asyncpg `ltree` type — see `docs/DecisionLog.md` for why. Segments must be ltree-label-safe (letters/digits/underscores only), which is why category slugs are generated with `slugify(..., sep="_")` instead of the hyphenated slugs used elsewhere in this service |

### Domain Services
- `CategoryRepository.get_children` (`repo.py`) — flat one-level listing under a parent
  (or top-level when `parent_id` is `None`).
- `CategoryRepository.get_subtree` (`repo.py`) — category + all descendants via a raw-SQL
  `path::ltree <@ CAST(:p AS ltree)` predicate against a GiST expression index
  (`ix_categories_path_gist`); the Postgres `ltree` extension is enabled specifically for
  this indexed predicate, nothing else in `product_db` uses it.

### Application Services
- Create/Update/Delete Category (`api/routes.py`) — `ADMIN`-only.
  `CategoryUpdate` is deliberately minimal (`is_active`/`sort_order` only): renaming or
  re-parenting a category would require recomputing `slug`/`path`/`depth` for the whole
  subtree, which is explicitly out of scope for this phase (see Open Questions below and
  `docs/FutureWork.md`).
- Delete is guarded: a category with children or with any Product referencing it via
  `category_id` cannot be deleted (409 Conflict).

### Repository Interfaces
- `CategoryRepository` (`repo.py`), built on the same `BaseRepository` pattern as the
  rest of `product_service`.

### Domain Events
| Event | Trigger | Maturity |
|---|---|---|
| `CategoryCreated` / `CategoryRenamed` | Not reserved in `ecom_common.events` | Conceptual-only — Category mutations are synchronous admin writes with no published events yet |

### Commands
- CreateCategory, UpdateCategory (is_active/sort_order only), DeleteCategory — all
  `ADMIN`-only.

### Queries
- ListCategories (children of a given `parent_id`, or top-level) — `GET /products/categories`.
- GetCategory — `GET /products/categories/{id}`.
- GetCategorySubtree — `GET /products/categories/{id}/subtree`.

### Relationships to Other Domains
| Domain | Relationship | Direction | Notes |
|---|---|---|---|
| Product | `Product.category_id` (nullable FK) | Category → Product | Not backfilled from `Product.category`/`sub_category` for the ~3271 pre-existing seeded rows — see `docs/DecisionLog.md` |

### Open Questions / Design Gaps
- No rename/re-parent endpoint exists — `CategoryUpdate` intentionally excludes `name`
  and `parent_id` because either would require recomputing `slug`/`path`/`depth` for the
  entire subtree. This is tracked in `docs/FutureWork.md`, not designed here.
- Legacy free-text backfill (mapping existing `Product.category`/`sub_category` string
  values onto canonical `Category` rows) is deferred to a later phase — see
  `docs/DecisionLog.md` for why it wasn't done as part of this migration.

---

## Domain: Brand

### Overview
- **Bounded Context:** `product_service`
- **Maturity Tag:** Built (promoted from Conceptual-only by Phase 1 Catalog Core)
- **Grounding:** `python/services/product_service/src/product_service/models.py::Brand`,
  migration `0003_catalog_taxonomy.py`. The legacy `Product.brand` free-text column
  still exists unchanged alongside the new `brands` table and `Product.brand_id` FK.

### Business Responsibilities
- Provide a single canonical record per brand (name, slug, logo, description,
  active/inactive flag, optional link to a `Manufacturer`) that `Product.brand_id` can
  reference instead of (or alongside, for now) repeating a free-text string per row.

### Aggregate Roots
| Aggregate | Identity | Invariants it enforces |
|---|---|---|
| Brand | `id: int` | `name` unique; `slug` unique; `manufacturer_id`, if set, must reference an existing Manufacturer |

### Entities / Value Objects
None — Brand is a flat aggregate with no child entities in this phase.

### Domain Services / Application Services / Repository Interfaces
- `BrandRepository` (`repo.py`), same `BaseRepository` pattern.
- Create/Update/Delete Brand (`api/routes.py`) — `ADMIN`-only. Delete is a hard delete
  (`BaseRepository.delete`) — unlike `Product`, Brand does not soft-delete; see
  `docs/DecisionLog.md` for why soft-delete was scoped to Product only.

### Domain Events
| Event | Trigger | Maturity |
|---|---|---|
| `BrandCreated` | Not reserved in `ecom_common.events` | Conceptual-only — Brand mutations are synchronous admin writes with no published events yet |

### Commands
- CreateBrand, UpdateBrand, DeleteBrand — all `ADMIN`-only.

### Queries
- ListBrands (active only) — `GET /products/brands`.
- GetBrand — `GET /products/brands/{id}`.

### Relationships to Other Domains
| Domain | Relationship | Direction | Notes |
|---|---|---|---|
| Product | `Product.brand_id` (nullable FK) | Brand → Product | Not backfilled from `Product.brand` for the ~3271 pre-existing seeded rows — see `docs/DecisionLog.md` |
| Manufacturer | `Brand.manufacturer_id` (nullable FK) | Manufacturer → Brand | `Manufacturer` (`models.py::Manufacturer`) is a new Built aggregate introduced in the same Phase 1 migration set — name, `country_of_origin` (ISO alpha-2), JSONB `contact_info`. Not given its own domain-catalog row in this pass; see the cluster-level note at the top of this file |

### Open Questions / Design Gaps
- Legacy free-text backfill (mapping existing `Product.brand` string values onto
  canonical `Brand` rows) is deferred to a later phase — see `docs/DecisionLog.md`.
- Whether `Manufacturer` should be promoted to its own domain-catalog row (rather than
  living as a footnote under Brand) is an open documentation question, not a code
  question — flagged in `docs/FutureWork.md`.
