# Decision Log

Append-only. Most recent decision first. Historical entries are never edited except to
mark them superseded — see `## Decision: <title>` → `**Status:**` on each entry.

---

## Decision: Scope the `product_name` → `title` rename to a plain column rename, no compatibility shim
- **Date:** 2026-07-19
- **Status:** Accepted
- **Grounding:** `services/product_service/alembic/versions/0006_product_catalog_columns.py`, `services/product_service/src/product_service/models.py::Product`, `services/product_service/src/product_service/schemas.py`
- **Context:** The original `products.product_name` column name predated Phase 1 and
  didn't match the vocabulary already used everywhere else in the schemas/routes
  (`title` is what `ProductCreate`/`ProductUpdate`/`ProductResponse` already called it in
  spirit — the DB column was just out of sync). Phase 1 touches the `products` table
  anyway, making this the natural point to fix it.
- **Decision:** Rename the column in place (`ALTER TABLE products RENAME COLUMN
  product_name TO title`) in migration `0006`, with no dual-read/dual-write
  compatibility window, and rename the event payload key from `product_name` to `title`
  to match.
- **Alternatives Considered:**
  - *Add a new `title` column and dual-write/dual-read both columns for a compatibility
    window* — rejected. A grounding check found zero consumers of the raw `product_name`
    column or the `product_name` event-payload key outside `product_service` itself (no
    service currently subscribes to `Topics.PRODUCT`). Building a compatibility shim to
    protect a consumer that doesn't exist would be pure overhead.
  - *Keep the DB column named `product_name` and remap it to `title` only in the
    Pydantic schema layer (field alias)* — rejected. This would leave the persisted
    schema out of sync with the domain vocabulary used everywhere else (`slug`, `title`,
    etc.), which is exactly the kind of drift that caused migration `0002` to be needed
    in the first place (model said `Text`, live schema stayed at the old bounded type).
- **Consequences:**
  - Positive: one clean rename, no shim to carry forward or eventually remove.
  - Negative: this is a real breaking change for anything that queries the `products`
    table directly by column name outside the ORM (raw SQL tooling, BI dashboards). None
    are known to exist today, but this assumption should be re-verified before Phase 2
    ships, since Phase 2 (marketplace split) will touch this table again.
- **Revisit When:** Before Phase 2 (marketplace split) begins — re-verify no external
  raw-SQL consumer of `products.product_name` has appeared since this rename.

---

## Decision: Defer legacy `category`/`sub_category`/`brand` free-text backfill into the new FKs
- **Date:** 2026-07-19
- **Status:** Accepted
- **Grounding:** `services/product_service/alembic/versions/0006_product_catalog_columns.py` (docstring explicitly calls this out), `services/product_service/src/product_service/models.py::Product`
- **Context:** `Product` now has both the legacy free-text `category`/`sub_category`/
  `brand` columns and new nullable `brand_id`/`manufacturer_id`/`category_id` FKs to the
  new `Brand`/`Manufacturer`/`Category` tables. The ~3271 rows seeded from the original
  CSV catalog have inconsistent, uncurated values in those free-text columns (casing,
  whitespace, near-duplicates).
- **Decision:** Ship Phase 1 with `brand_id`/`manufacturer_id`/`category_id` left `NULL`
  on all pre-existing rows. No backfill/dedup pass runs as part of this migration set.
- **Alternatives Considered:**
  - *Auto-create Brand/Category rows from the distinct existing free-text values during
    migration `0006`* — rejected. This would blindly materialize whatever duplication and
    inconsistency already exists in the free text (e.g. "Gaming" and "gaming " becoming
    two different Category rows), reproducing inside the new controlled-vocabulary
    tables the exact failure mode this whole redesign exists to eliminate.
  - *Manual admin backfill via a one-off script, done alongside this migration* —
    rejected on sequencing grounds: there is no curated target taxonomy yet to map the
    legacy strings onto. Taxonomy curation is a data-quality exercise that needs to
    happen before backfill, not during it.
- **Consequences:**
  - Positive: Phase 1 ships without needing a data-quality/dedup pass gating it.
  - Negative: the new `brand_id`/`category_id` query-param filters on `GET /products`
    return nothing for any of the pre-existing seeded catalog until backfill runs in a
    later phase — the new taxonomy is functionally empty for legacy data until then.
- **Revisit When:** A later phase (tracked in `docs/FutureWork.md`) curates a canonical
  taxonomy and runs the backfill.

---

## Decision: Soft-delete `Product`, keep hard-delete for the new taxonomy tables
- **Date:** 2026-07-19
- **Status:** Accepted
- **Grounding:** `services/product_service/src/product_service/models.py::Product` (`is_deleted`/`deleted_at`/`deleted_by`), `services/product_service/src/product_service/api/routes.py::delete_product` vs. `delete_brand`/`delete_manufacturer`/`delete_tag`/`delete_collection` (all still call `BaseRepository.delete`, a hard delete)
- **Context:** `DELETE /products/{id}` previously did a real `DELETE FROM products`.
  Phase 1 adds `product_variants`, `product_images`, and `collection_products` rows that
  reference a `Product` — a hard delete would either cascade-destroy those (silent data
  loss, no audit trail) or require every one of them to be cleaned up first.
- **Decision:** Add `is_deleted`/`deleted_at`/`deleted_by` to `Product`; `DELETE
  /products/{id}` now sets those flags instead of removing the row. All catalog read
  paths (`_get_active_product`, `ProductRepository.build_catalog_query`,
  `list_collection_products`) filter `is_deleted = false` by default, so a soft-deleted
  product 404s identically to how a hard-deleted one used to — the behavior change is
  invisible externally. The new taxonomy tables (`Brand`, `Manufacturer`, `Category`,
  `Tag`, `Collection`) were **not** given the same treatment — their admin delete
  endpoints still hard-delete via `BaseRepository.delete`.
- **Alternatives Considered:**
  - *Keep `Product` as hard-delete* — rejected. Destroys the audit trail, is
    irreversible, and (unlike `Category`'s delete endpoint, which explicitly checks for
    and blocks deletion when children/products reference it) `Product` has no equivalent
    dependent-record guard for its own variants/images/collection memberships — a hard
    delete would silently orphan or cascade-destroy them.
  - *A separate `deleted_products` archive table* — rejected as unneeded complexity; a
    boolean flag plus a partial index (`ix_products_published_category` already needs
    `is_deleted = false` in its predicate for the same reason) achieves the same
    filtering behavior more simply.
  - *Soft-delete everything (Brand/Manufacturer/Category/Tag/Collection too), for
    consistency* — rejected for this phase. Those are low-volume, admin-only master-data
    tables where `Category`/`Collection` deletes already have explicit dependent-record
    checks (a Category with children or referencing products can't be deleted at all);
    the audit-trail/orphan-prevention argument that motivates Product's soft-delete is
    much weaker there. Revisiting this for consistency is plausible future work but
    wasn't judged worth the scope increase now.
- **Consequences:**
  - Positive: reversible, auditable, preserves FK integrity for variants/images/
    collection memberships without requiring cascade logic.
  - Negative: every catalog read path must remember to filter `is_deleted` — a new query
    written without that filter would silently resurface deleted products. This is a
    real footgun for future code in this file.
- **Revisit When:** If a genuine hard-delete requirement emerges (e.g. legal/compliance
  data-erasure request) — Phase 1 provides no hard-delete path for `Product` at all
  post-soft-delete.

---

## Decision: Materialized `path` on `Category` as a plain string, cast to `ltree` only in raw SQL
- **Date:** 2026-07-19
- **Status:** Accepted
- **Grounding:** `services/product_service/src/product_service/models.py::Category` (module-level docstring), `services/product_service/src/product_service/repo.py::CategoryRepository.get_subtree`, `services/product_service/alembic/versions/0003_catalog_taxonomy.py`
- **Context:** `Category` needed a self-referencing hierarchy with efficient indexed
  "give me this category and everything under it" (subtree) queries — the kind of query
  a plain adjacency list with recursive CTEs handles poorly at scale, and that
  Postgres's `ltree` extension is built for.
- **Decision:** Declare `Category.path` as a plain SQLAlchemy `String` column (a
  dot-separated, underscore-joined slug path, e.g.
  `electronics.mobiles_and_accessories.smartphones`). Enable the `ltree` extension and
  build a GiST expression index on `path::ltree` (`ix_categories_path_gist`), but only
  ever cast to `ltree` inside raw SQL text server-side (`CategoryRepository.get_subtree`'s
  `text("path::ltree <@ CAST(:p AS ltree)")`). Every value that crosses the asyncpg wire
  stays plain text — no native ltree column type, no asyncpg type-codec registration.
- **Alternatives Considered:**
  - *Native `ltree` SQLAlchemy/asyncpg column type* — rejected. `ltree` isn't a built-in
    asyncpg type; using it natively requires registering a custom type codec on the
    connection, which is fragile and version-sensitive across asyncpg releases and adds
    an operational failure mode (codec registration breaking silently on an asyncpg
    upgrade) for a single indexed predicate's benefit.
  - *Plain adjacency list only (`parent_id`), no materialized path, subtree queries via
    recursive CTE* — rejected. Works, but gives up an indexed descendant lookup;
    acceptable at today's scale but a worse foundation given faceted category browsing
    is an explicit target of this redesign.
- **Consequences:**
  - Positive: avoids driver-level fragility; the plain-text `path` column is trivially
    portable/inspectable/debuggable with ordinary SQL tooling.
  - Negative: `Category.slug` (and therefore each `path` segment) must stay
    ltree-label-safe — letters, digits, underscores only. This is why category slug
    generation uses `slugify(..., sep="_")` specifically, diverging from the
    hyphen-separated slugs used for `Product`/`Brand`/`Collection`/`Tag` elsewhere in
    this service. A future engineer adding a category-naming feature needs to know this
    or will produce a `path` that fails its own `ltree` cast at query time.
- **Revisit When:** If asyncpg ships first-class, stable `ltree` codec support, or if
  `ltree` usage in this service grows beyond the single indexed subtree predicate (at
  which point the raw-SQL-cast approach's ergonomics start to cost more than the codec
  fragility it avoids).

---

## Decision: Extend `products` additively rather than a destructive/normalizing migration
- **Date:** 2026-07-19
- **Status:** Accepted
- **Grounding:** `services/product_service/alembic/versions/0003_catalog_taxonomy.py` through `0006_product_catalog_columns.py` (docstrings), `docs/features/product-catalog-core-phase1.md`
- **Context:** `product_db` already held ~3271 seeded rows in `products` at the time
  this phase was planned. The 4-phase catalog redesign (Catalog core → Marketplace split
  → Inventory re-key → Cleanup) was scoped, but only Phase 1 was approved to build.
- **Decision:** Every schema change in this phase is additive: new tables
  (`manufacturers`, `brands`, `categories`, `collections`, `collection_products`,
  `tags`, `product_tags`, `product_attributes`, `attribute_values`, `product_variants`,
  `product_variant_attribute_values`, `product_images`) plus new nullable columns on the
  existing `products` table. Every new `NOT NULL` column uses a constant
  `server_default` (never a computed one), keeping these Postgres 11+ metadata-only
  changes rather than full-table rewrites. The legacy `category`/`sub_category`/`brand`
  columns are left completely untouched in meaning.
- **Alternatives Considered:**
  - *Normalize immediately: replace `category`/`sub_category`/`brand` free-text columns
    with FKs in this same migration set, backfilling as part of the cutover* — rejected.
    Would require a synchronous data-quality/dedup pass on uncurated seeded data before
    any of this phase could ship (see the separate "defer legacy backfill" decision
    above), and would break any code still reading the flat fields during a rolling
    deploy.
  - *Shadow table + dual-write pattern (write both old and new shapes, cut over readers
    gradually)* — rejected as unneeded complexity for a single-service, single-database
    change with no cross-service consumers of the raw `products` columns to coordinate
    with.
- **Consequences:**
  - Positive: zero-downtime migration, fully backward-compatible reads/writes throughout
    the deploy, no coordinated multi-phase cutover needed just to ship Phase 1.
  - Negative: `Product` now carries two parallel representations of category/brand (free
    text + FK) with no enforced consistency between them, and will continue to until
    Phase 4 (cleanup/legacy-column drop). Any code reading `Product.category`/`brand`
    without also checking `category_id`/`brand_id` (or vice versa) can silently produce
    inconsistent results during this window.
- **Revisit When:** Phase 4 (cleanup) — once legacy-column backfill (a separate,
  already-logged decision above) has run and every consumer reads from the new FKs, the
  legacy free-text columns can be dropped.
