"""product variants, variant attribute links, product images

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-19

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005"
down_revision: str | Sequence[str] | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "product_variants",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), nullable=False),
        sa.Column("variant_name", sa.String(200), nullable=False),
        sa.Column("barcode", sa.String(64), nullable=True),
        sa.Column("upc", sa.String(64), nullable=True),
        sa.Column("ean", sa.String(64), nullable=True),
        sa.Column("hsn_code", sa.String(16), nullable=True),
        sa.Column("gst_category", sa.String(40), nullable=True),
        sa.Column("country_of_origin", sa.String(2), nullable=True),
        sa.Column("weight_grams", sa.Integer(), nullable=True),
        sa.Column("length_mm", sa.Integer(), nullable=True),
        sa.Column("width_mm", sa.Integer(), nullable=True),
        sa.Column("height_mm", sa.Integer(), nullable=True),
        sa.Column("fragile", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("shipping_class", sa.String(40), nullable=True),
        sa.Column("manufacturer_warranty_months", sa.Integer(), nullable=True),
        sa.Column("serial_number_required", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("expiry_tracked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("attributes", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("status", sa.String(20), nullable=False, server_default="ACTIVE"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_product_variants_product_id", "product_variants", ["product_id"])
    op.create_index("ix_product_variants_hsn_code", "product_variants", ["hsn_code"])
    op.create_index(
        "uq_product_variants_barcode", "product_variants", ["barcode"], unique=True, postgresql_where=sa.text("barcode IS NOT NULL")
    )
    op.create_index(
        "uq_product_variants_upc", "product_variants", ["upc"], unique=True, postgresql_where=sa.text("upc IS NOT NULL")
    )
    op.create_index(
        "uq_product_variants_ean", "product_variants", ["ean"], unique=True, postgresql_where=sa.text("ean IS NOT NULL")
    )
    op.create_index(
        "ix_product_variants_attributes_gin", "product_variants", ["attributes"], postgresql_using="gin"
    )

    op.create_table(
        "product_variant_attribute_values",
        sa.Column("variant_id", sa.Integer(), sa.ForeignKey("product_variants.id"), primary_key=True),
        sa.Column("attribute_value_id", sa.Integer(), sa.ForeignKey("attribute_values.id"), primary_key=True),
    )

    op.create_table(
        "product_images",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), nullable=False),
        sa.Column("variant_id", sa.Integer(), sa.ForeignKey("product_variants.id"), nullable=True),
        sa.Column("kind", sa.String(20), nullable=False, server_default="GALLERY"),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("video_url", sa.Text(), nullable=True),
        sa.Column("alt_text", sa.String(255), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_product_images_product_id", "product_images", ["product_id"])
    op.create_index("ix_product_images_variant_id", "product_images", ["variant_id"])
    op.create_index(
        "uq_product_images_primary",
        "product_images",
        ["product_id", "variant_id"],
        unique=True,
        postgresql_where=sa.text("kind = 'PRIMARY'"),
        # Plain unique indexes treat each NULL as distinct, so without this,
        # two product-level PRIMARY images (variant_id IS NULL) would NOT
        # violate the constraint — defeating the whole point of the index.
        # Requires Postgres 15+; this repo runs postgres:17-alpine.
        postgresql_nulls_not_distinct=True,
    )


def downgrade() -> None:
    op.drop_index("uq_product_images_primary", table_name="product_images")
    op.drop_index("ix_product_images_variant_id", table_name="product_images")
    op.drop_index("ix_product_images_product_id", table_name="product_images")
    op.drop_table("product_images")

    op.drop_table("product_variant_attribute_values")

    op.drop_index("ix_product_variants_attributes_gin", table_name="product_variants")
    op.drop_index("uq_product_variants_ean", table_name="product_variants")
    op.drop_index("uq_product_variants_upc", table_name="product_variants")
    op.drop_index("uq_product_variants_barcode", table_name="product_variants")
    op.drop_index("ix_product_variants_hsn_code", table_name="product_variants")
    op.drop_index("ix_product_variants_product_id", table_name="product_variants")
    op.drop_table("product_variants")
