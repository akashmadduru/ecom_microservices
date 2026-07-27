"""widen product_name/category/sub_category/brand to unbounded text

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-12

`product_service.models.Product` declares these columns as `Text`, but this
migration was never added when the model changed — the live schema stayed
at VARCHAR(500)/VARCHAR(200), so importing catalog rows whose title or
category exceeds those bounds raised StringDataRightTruncationError. This
brings the schema back in sync with the model.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | Sequence[str] | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("products", "product_name", type_=sa.Text(), existing_nullable=False)
    op.alter_column("products", "category", type_=sa.Text(), existing_nullable=True)
    op.alter_column("products", "sub_category", type_=sa.Text(), existing_nullable=True)
    op.alter_column("products", "brand", type_=sa.Text(), existing_nullable=True)


def downgrade() -> None:
    op.alter_column("products", "product_name", type_=sa.String(500), existing_nullable=False)
    op.alter_column("products", "category", type_=sa.String(200), existing_nullable=True)
    op.alter_column("products", "sub_category", type_=sa.String(200), existing_nullable=True)
    op.alter_column("products", "brand", type_=sa.String(200), existing_nullable=True)
