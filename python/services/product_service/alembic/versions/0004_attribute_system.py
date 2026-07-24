"""attribute system: product_attributes, attribute_values

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-19

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | Sequence[str] | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "product_attributes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("code", sa.String(100), nullable=False),
        sa.Column("is_variant_defining", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_product_attributes_name", "product_attributes", ["name"], unique=True)
    op.create_index("ix_product_attributes_code", "product_attributes", ["code"], unique=True)

    op.create_table(
        "attribute_values",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("attribute_id", sa.Integer(), sa.ForeignKey("product_attributes.id"), nullable=False),
        sa.Column("value", sa.String(150), nullable=False),
        sa.Column("slug", sa.String(160), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint("attribute_id", "value", name="uq_attribute_values_attribute_value"),
    )
    op.create_index("ix_attribute_values_attribute_id", "attribute_values", ["attribute_id"])


def downgrade() -> None:
    op.drop_index("ix_attribute_values_attribute_id", table_name="attribute_values")
    op.drop_table("attribute_values")
    op.drop_index("ix_product_attributes_code", table_name="product_attributes")
    op.drop_index("ix_product_attributes_name", table_name="product_attributes")
    op.drop_table("product_attributes")
