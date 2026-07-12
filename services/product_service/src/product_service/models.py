from decimal import Decimal

from ecom_common.db import Base, TimestampMixin
from sqlalchemy import Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column


class Product(Base, TimestampMixin):
    """Catalog product. Carried over from the original flat model with typed
    columns: prices are Numeric (were Float), timestamps are real timestamptz
    (were String), rating is the denormalized review average (Numeric)."""

    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    uniq_id: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)
    product_name: Mapped[str] = mapped_column(Text, nullable=False)
    product_url: Mapped[str | None] = mapped_column(Text)
    retail_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    discount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    image_urls: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(Text, index=True)
    sub_category: Mapped[str | None] = mapped_column(Text, index=True)
    brand: Mapped[str | None] = mapped_column(Text, index=True)
    rating: Mapped[Decimal] = mapped_column(Numeric(3, 2), default=Decimal("0"))
    review_count: Mapped[int] = mapped_column(default=0)
    seller_id: Mapped[str | None] = mapped_column(String(64), index=True)  # user id of the owning seller
