"""baseline products table

Revision ID: 0001
Revises:
Create Date: 2026-07-11

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "products",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("uniq_id", sa.String(64), nullable=True),
        sa.Column("product_name", sa.String(500), nullable=False),
        sa.Column("product_url", sa.Text(), nullable=True),
        sa.Column("retail_price", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("discount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("image_urls", sa.Text(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", sa.String(200), nullable=True),
        sa.Column("sub_category", sa.String(200), nullable=True),
        sa.Column("brand", sa.String(200), nullable=True),
        sa.Column("rating", sa.Numeric(3, 2), nullable=False, server_default="0"),
        sa.Column("review_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("seller_id", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_products_uniq_id", "products", ["uniq_id"], unique=True)
    op.create_index("ix_products_category", "products", ["category"])
    op.create_index("ix_products_sub_category", "products", ["sub_category"])
    op.create_index("ix_products_brand", "products", ["brand"])
    op.create_index("ix_products_seller_id", "products", ["seller_id"])


def downgrade() -> None:
    op.drop_table("products")
