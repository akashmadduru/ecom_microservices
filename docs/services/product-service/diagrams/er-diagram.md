# Diagram: Entity-Relationship Diagram — product_db

## Diagram Type
ER Diagram

## Subject
The full `product_db` schema as of migration `0006` — 13 tables spanning the product catalog,
taxonomy, variant, and image concerns.

## Audience
Engineers writing queries/migrations against this schema; reviewers of schema changes.

## Required Elements
Every table, every FK relationship, and the columns most relevant to how each table is actually
queried (per `repo.py`).

## Diagram

```mermaid
erDiagram
    MANUFACTURER ||--o{ BRAND : "produces (nullable)"
    MANUFACTURER ||--o{ PRODUCT : "manufacturer_id (nullable)"
    BRAND ||--o{ PRODUCT : "brand_id (nullable)"
    CATEGORY ||--o{ CATEGORY : "parent_id (self-referencing)"
    CATEGORY ||--o{ PRODUCT : "category_id (nullable)"
    PRODUCT ||--o{ PRODUCT_VARIANT : "product_id"
    PRODUCT ||--o{ PRODUCT_IMAGE : "product_id (product-level gallery)"
    PRODUCT_VARIANT ||--o{ PRODUCT_IMAGE : "variant_id (nullable, variant-scoped)"
    PRODUCT_VARIANT }o--o{ ATTRIBUTE_VALUE : "via product_variant_attribute_values"
    PRODUCT_ATTRIBUTE ||--o{ ATTRIBUTE_VALUE : "attribute_id"
    PRODUCT ||--o{ COLLECTION_PRODUCT : "product_id"
    COLLECTION ||--o{ COLLECTION_PRODUCT : "collection_id"
    PRODUCT ||--o{ PRODUCT_TAG : "product_id"
    TAG ||--o{ PRODUCT_TAG : "tag_id"

    PRODUCT {
        int id PK
        string uniq_id UK "legacy external id"
        text title "renamed from product_name (0006)"
        string slug UK
        numeric retail_price "legacy, untouched"
        numeric discount "legacy, untouched"
        text category "legacy free-text, untouched"
        text sub_category "legacy free-text, untouched"
        text brand "legacy free-text, untouched"
        string seller_id "legacy single-owner model"
        int brand_id FK "nullable, not backfilled from legacy text"
        int manufacturer_id FK "nullable"
        int category_id FK "nullable, not backfilled from legacy text"
        string status "ProductStatus, default DRAFT"
        jsonb attributes "spec-only, non-variant-defining"
        tsvector search_document "GENERATED ALWAYS AS ... STORED"
        bool is_deleted
        timestamptz deleted_at
        int version "edit-count, no CAS check yet"
    }
    PRODUCT_VARIANT {
        int id PK
        int product_id FK
        string variant_name
        string barcode "partial-unique WHERE NOT NULL"
        string upc "partial-unique WHERE NOT NULL"
        string ean "partial-unique WHERE NOT NULL"
        string hsn_code
        jsonb attributes "variant-defining snapshot"
        string status "VariantStatus"
    }
    PRODUCT_IMAGE {
        int id PK
        int product_id FK
        int variant_id FK "nullable"
        string kind "ImageKind, enum-typed at API layer"
        text url
        int sort_order
    }
    PRODUCT_VARIANT_ATTRIBUTE_VALUE {
        int variant_id PK_FK
        int attribute_value_id PK_FK
    }
    PRODUCT_ATTRIBUTE {
        int id PK
        string name UK
        string code UK
        bool is_variant_defining
    }
    ATTRIBUTE_VALUE {
        int id PK
        int attribute_id FK
        string value
        string slug
    }
    BRAND {
        int id PK
        string name UK
        string slug UK
        int manufacturer_id FK "nullable"
        bool is_active
    }
    MANUFACTURER {
        int id PK
        string name UK
        string country_of_origin
        jsonb contact_info
    }
    CATEGORY {
        int id PK
        int parent_id FK "nullable, self-referencing"
        string name
        string slug UK
        string path "materialized path, dot-joined, ltree-cast at query time"
        int depth
    }
    COLLECTION {
        int id PK
        string name
        string slug UK
        bool is_active
        timestamptz starts_at
        timestamptz ends_at
    }
    COLLECTION_PRODUCT {
        int collection_id PK_FK
        int product_id PK_FK
        int sort_order
    }
    TAG {
        int id PK
        string name UK
        string slug UK
    }
    PRODUCT_TAG {
        int product_id PK_FK
        int tag_id PK_FK
    }
```

## Notes

- **No table in this diagram has a foreign key into another service's database.** Everything
  above is `product_db`-internal. The one cross-service reference this service participates in
  (`inventory_service.inventory.product_id` → this `PRODUCT.id`) is deliberately absent from this
  diagram because it isn't a real foreign key — see `docs/DecisionLog.md`'s note on the
  per-service-database pattern, and `e2e-product-inventory-sync.md` for how that reference is
  actually kept consistent (via events, not a constraint).
- `CATEGORY.path` looks like a plain string here because it is one at the SQLAlchemy/column-type
  level — the `ltree` extension is used only via a GiST *expression* index and raw-SQL casts in
  `CategoryRepository.get_subtree`, never as the column's declared type. See the LLD §4 and
  `docs/DecisionLog.md` for the full reasoning (avoiding asyncpg custom-type-codec fragility).
- `PRODUCT.brand`/`category`/`sub_category`/`retail_price`/`discount`/`seller_id` (marked
  "legacy" above) coexist with the normalized `brand_id`/`category_id`/`manufacturer_id` FKs by
  design — Phase 1 is additive, not a replacement migration. They are not shown with a
  relationship line because they are plain unindexed-beyond-legacy text/numeric columns, not
  foreign keys.
