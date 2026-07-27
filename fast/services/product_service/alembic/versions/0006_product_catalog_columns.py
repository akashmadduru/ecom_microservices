"""product catalog columns: title rename, slug, taxonomy FKs, status,
soft-delete/audit, SEO fields, attribute bag, generated search document

Revision ID: 0006
Revises: 0005
Create Date: 2026-07-19

Renames `products.product_name` -> `products.title` and layers the rest of
the Phase 1 catalog columns onto the existing (~3271-row) seeded `products`
table. Every new NOT NULL column below uses a constant `server_default`
(never a computed one), so on Postgres 11+ these are metadata-only changes —
no full-table rewrite/lock beyond the brief `ACCESS EXCLUSIVE` needed to
update the catalog. The one genuinely per-row operation is the `slug`
backfill, done as a Python loop (fine for a one-time ~3271-row migration).

`brand_id`/`manufacturer_id`/`category_id` are added nullable and are
deliberately NOT backfilled from the legacy free-text `category`/
`sub_category`/`brand` columns in this migration — that mapping is deferred
to a later phase.
"""
import re
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006"
down_revision: str | Sequence[str] | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")
    return slug or "item"


def _backfill_slugs() -> None:
    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, title FROM products ORDER BY id")).fetchall()

    seen: set[str] = set()
    for row in rows:
        base_slug = _slugify(row.title)
        slug = base_slug
        if slug in seen:
            slug = f"{base_slug}-{row.id}"
        seen.add(slug)
        bind.execute(sa.text("UPDATE products SET slug = :slug WHERE id = :id"), {"slug": slug, "id": row.id})


def upgrade() -> None:
    op.alter_column("products", "product_name", new_column_name="title")

    # slug: nullable first, backfilled, then locked down NOT NULL + unique.
    op.add_column("products", sa.Column("slug", sa.String(320), nullable=True))
    _backfill_slugs()
    op.alter_column("products", "slug", nullable=False)
    op.create_index("ix_products_slug", "products", ["slug"], unique=True)

    op.add_column("products", sa.Column("brand_id", sa.Integer(), sa.ForeignKey("brands.id"), nullable=True))
    op.add_column("products", sa.Column("manufacturer_id", sa.Integer(), sa.ForeignKey("manufacturers.id"), nullable=True))
    op.add_column("products", sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=True))
    op.create_index("ix_products_brand_id", "products", ["brand_id"])
    op.create_index("ix_products_category_id", "products", ["category_id"])

    op.add_column("products", sa.Column("status", sa.String(20), nullable=False, server_default="PUBLISHED"))
    op.create_index("ix_products_status", "products", ["status"])

    op.add_column("products", sa.Column("seo_title", sa.String(255), nullable=True))
    op.add_column("products", sa.Column("seo_description", sa.String(500), nullable=True))
    op.add_column("products", sa.Column("canonical_url", sa.Text(), nullable=True))
    op.add_column("products", sa.Column("meta_keywords", postgresql.ARRAY(sa.String()), nullable=True))

    op.add_column(
        "products",
        sa.Column("attributes", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    op.create_index("ix_products_attributes_gin", "products", ["attributes"], postgresql_using="gin")

    # Postgres generated (STORED) column; raw DDL because it needs the
    # GENERATED ALWAYS AS (...) STORED clause that op.add_column doesn't emit.
    op.execute(
        "ALTER TABLE products ADD COLUMN search_document tsvector "
        "GENERATED ALWAYS AS (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,''))) STORED"
    )
    op.create_index("ix_products_search_document_gin", "products", ["search_document"], postgresql_using="gin")

    op.add_column("products", sa.Column("created_by", sa.String(64), nullable=True))
    op.add_column("products", sa.Column("updated_by", sa.String(64), nullable=True))
    op.add_column("products", sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_index("ix_products_is_deleted", "products", ["is_deleted"])
    op.add_column("products", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("products", sa.Column("deleted_by", sa.String(64), nullable=True))
    op.add_column("products", sa.Column("version", sa.Integer(), nullable=False, server_default="1"))

    op.create_index(
        "ix_products_published_category",
        "products",
        ["category_id"],
        postgresql_where=sa.text("status = 'PUBLISHED' AND is_deleted = false"),
    )


def downgrade() -> None:
    op.drop_index("ix_products_published_category", table_name="products")

    op.drop_column("products", "version")
    op.drop_column("products", "deleted_by")
    op.drop_column("products", "deleted_at")
    op.drop_index("ix_products_is_deleted", table_name="products")
    op.drop_column("products", "is_deleted")
    op.drop_column("products", "updated_by")
    op.drop_column("products", "created_by")

    op.drop_index("ix_products_search_document_gin", table_name="products")
    op.drop_column("products", "search_document")

    op.drop_index("ix_products_attributes_gin", table_name="products")
    op.drop_column("products", "attributes")

    op.drop_column("products", "meta_keywords")
    op.drop_column("products", "canonical_url")
    op.drop_column("products", "seo_description")
    op.drop_column("products", "seo_title")

    op.drop_index("ix_products_status", table_name="products")
    op.drop_column("products", "status")

    op.drop_index("ix_products_category_id", table_name="products")
    op.drop_index("ix_products_brand_id", table_name="products")
    op.drop_column("products", "category_id")
    op.drop_column("products", "manufacturer_id")
    op.drop_column("products", "brand_id")

    op.drop_index("ix_products_slug", table_name="products")
    op.drop_column("products", "slug")

    op.alter_column("products", "title", new_column_name="product_name")
