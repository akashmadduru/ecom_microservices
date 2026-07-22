"""catalog taxonomy: manufacturers, brands, categories, collections, tags

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-19

Introduces the taxonomy tables for Phase 1 of the Product Catalog Domain
redesign. `categories.path` is a plain dot-separated slug-path string (not a
native ltree column type — see the module-level comment on the `Category`
model for why), but the ltree extension is enabled so subtree queries can use
a GiST expression index on `path::ltree` for indexed ancestor/descendant
lookups. Every value that crosses the asyncpg wire stays plain text; the cast
only happens server-side in raw SQL predicates.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: str | Sequence[str] | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS ltree")

    op.create_table(
        "manufacturers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("country_of_origin", sa.String(2), nullable=True),
        sa.Column("contact_info", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_manufacturers_name", "manufacturers", ["name"], unique=True)

    op.create_table(
        "brands",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(220), nullable=False),
        sa.Column("logo_url", sa.Text(), nullable=True),
        sa.Column("manufacturer_id", sa.Integer(), sa.ForeignKey("manufacturers.id"), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_brands_name", "brands", ["name"], unique=True)
    op.create_index("ix_brands_slug", "brands", ["slug"], unique=True)

    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("parent_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=True),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("slug", sa.String(170), nullable=False),
        sa.Column("path", sa.String(), nullable=False),
        sa.Column("depth", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("parent_id", "name", name="uq_categories_parent_name"),
    )
    op.create_index("ix_categories_slug", "categories", ["slug"], unique=True)
    op.create_index("ix_categories_parent_id", "categories", ["parent_id"])
    # Expression index (GiST) on the ltree cast of `path`, for indexed subtree
    # queries (`path::ltree <@ CAST(:p AS ltree)`); `path` itself stays a plain
    # text column, no autogenerate support for expression indexes hence raw SQL.
    op.execute("CREATE INDEX ix_categories_path_gist ON categories USING GIST ((path::ltree))")

    op.create_table(
        "collections",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(220), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_collections_slug", "collections", ["slug"], unique=True)

    op.create_table(
        "collection_products",
        sa.Column("collection_id", sa.Integer(), sa.ForeignKey("collections.id"), primary_key=True),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), primary_key=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )

    op.create_table(
        "tags",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("slug", sa.String(90), nullable=False),
    )
    op.create_index("ix_tags_name", "tags", ["name"], unique=True)
    op.create_index("ix_tags_slug", "tags", ["slug"], unique=True)

    op.create_table(
        "product_tags",
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), primary_key=True),
        sa.Column("tag_id", sa.Integer(), sa.ForeignKey("tags.id"), primary_key=True),
    )


def downgrade() -> None:
    op.drop_table("product_tags")
    op.drop_index("ix_tags_slug", table_name="tags")
    op.drop_index("ix_tags_name", table_name="tags")
    op.drop_table("tags")
    op.drop_table("collection_products")
    op.drop_index("ix_collections_slug", table_name="collections")
    op.drop_table("collections")
    op.execute("DROP INDEX IF EXISTS ix_categories_path_gist")
    op.drop_index("ix_categories_parent_id", table_name="categories")
    op.drop_index("ix_categories_slug", table_name="categories")
    op.drop_table("categories")
    op.drop_index("ix_brands_slug", table_name="brands")
    op.drop_index("ix_brands_name", table_name="brands")
    op.drop_table("brands")
    op.drop_index("ix_manufacturers_name", table_name="manufacturers")
    op.drop_table("manufacturers")
    # Safe: this migration is the only thing in this codebase that creates
    # the ltree extension, and nothing else in `product_db` depends on it.
    op.execute("DROP EXTENSION IF EXISTS ltree")
