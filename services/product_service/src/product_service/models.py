from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from ecom_common.db import Base, TimestampMixin
from sqlalchemy import (
    ARRAY,
    Boolean,
    Computed,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column, relationship


class ProductStatus(StrEnum):
    DRAFT = "DRAFT"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    PUBLISHED = "PUBLISHED"
    REJECTED = "REJECTED"
    ARCHIVED = "ARCHIVED"
    DISCONTINUED = "DISCONTINUED"


class VariantStatus(StrEnum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    DISCONTINUED = "DISCONTINUED"


class ImageKind(StrEnum):
    PRIMARY = "PRIMARY"
    GALLERY = "GALLERY"
    THUMBNAIL = "THUMBNAIL"
    SPIN_360 = "SPIN_360"
    VIDEO = "VIDEO"


class Manufacturer(Base, TimestampMixin):
    __tablename__ = "manufacturers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    country_of_origin: Mapped[str | None] = mapped_column(String(2))  # ISO alpha-2
    contact_info: Mapped[dict | None] = mapped_column(JSONB)


class Brand(Base, TimestampMixin):
    __tablename__ = "brands"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True, nullable=False, index=True)
    slug: Mapped[str] = mapped_column(String(220), unique=True, nullable=False)
    logo_url: Mapped[str | None] = mapped_column(Text)
    manufacturer_id: Mapped[int | None] = mapped_column(ForeignKey("manufacturers.id"))
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Category(Base, TimestampMixin):
    """Self-referencing catalog hierarchy using a pragmatic materialized-path
    approach: `path` is a plain dot-separated slug string (e.g.
    "electronics.mobiles.smartphones"), NOT a native SQLAlchemy/asyncpg ltree
    column type. Postgres's `ltree` extension is still used for *indexed
    subtree queries* (see migration 0003's GiST expression index on
    `path::ltree` and `CategoryRepository.get_subtree`'s `path::ltree <@
    CAST(:p AS ltree)` predicate), but the cast happens only in raw SQL text
    server-side — every value that crosses the asyncpg wire stays plain text,
    deliberately avoiding fragile/version-sensitive asyncpg ltree type-codec
    registration.
    """

    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("parent_id", "name", name="uq_categories_parent_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"))
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    slug: Mapped[str] = mapped_column(String(170), unique=True, nullable=False)
    path: Mapped[str] = mapped_column(String, nullable=False)
    depth: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Collection(Base, TimestampMixin):
    __tablename__ = "collections"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(220), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CollectionProduct(Base):
    __tablename__ = "collection_products"

    collection_id: Mapped[int] = mapped_column(ForeignKey("collections.id"), primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), primary_key=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(90), unique=True, nullable=False)


class ProductTag(Base):
    __tablename__ = "product_tags"

    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), primary_key=True)
    tag_id: Mapped[int] = mapped_column(ForeignKey("tags.id"), primary_key=True)


class ProductAttribute(Base):
    __tablename__ = "product_attributes"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    code: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    is_variant_defining: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class AttributeValue(Base):
    __tablename__ = "attribute_values"
    __table_args__ = (UniqueConstraint("attribute_id", "value", name="uq_attribute_values_attribute_value"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    attribute_id: Mapped[int] = mapped_column(ForeignKey("product_attributes.id"), nullable=False)
    value: Mapped[str] = mapped_column(String(150), nullable=False)
    slug: Mapped[str] = mapped_column(String(160), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Product(Base, TimestampMixin):
    """Catalog product. Carried over from the original flat model with typed
    columns: prices are Numeric (were Float), timestamps are real timestamptz
    (were String), rating is the denormalized review average (Numeric).

    Phase 1 additive extension: taxonomy FKs (brand/manufacturer/category),
    slug, status/soft-delete/audit columns, SEO fields, a JSONB spec-attribute
    bag, and a generated full-text search column. The legacy free-text
    `category`/`sub_category`/`brand` columns are left untouched in meaning
    and are not backfilled from the new FKs in this phase.
    """

    __tablename__ = "products"
    __table_args__ = (
        Index(
            "ix_products_published_category",
            "category_id",
            postgresql_where=text("status = 'PUBLISHED' AND is_deleted = false"),
        ),
        Index("ix_products_attributes_gin", "attributes", postgresql_using="gin"),
        Index("ix_products_search_document_gin", "search_document", postgresql_using="gin"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    uniq_id: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    slug: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
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

    brand_id: Mapped[int | None] = mapped_column(ForeignKey("brands.id"), index=True)
    manufacturer_id: Mapped[int | None] = mapped_column(ForeignKey("manufacturers.id"))
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), index=True)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default=ProductStatus.DRAFT, index=True)

    seo_title: Mapped[str | None] = mapped_column(String(255))
    seo_description: Mapped[str | None] = mapped_column(String(500))
    canonical_url: Mapped[str | None] = mapped_column(Text)
    meta_keywords: Mapped[list[str] | None] = mapped_column(ARRAY(String))

    attributes: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))

    # Postgres generated column (STORED); read-only from the ORM — never set
    # via Create/Update schemas, SQLAlchemy excludes Computed columns from
    # INSERT/UPDATE automatically.
    search_document: Mapped[str | None] = mapped_column(
        TSVECTOR,
        Computed("to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,''))", persisted=True),
    )

    created_by: Mapped[str | None] = mapped_column(String(64))
    updated_by: Mapped[str | None] = mapped_column(String(64))
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_by: Mapped[str | None] = mapped_column(String(64))
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    variants: Mapped[list["ProductVariant"]] = relationship(back_populates="product", cascade="all, delete-orphan")
    images: Mapped[list["ProductImage"]] = relationship(back_populates="product", cascade="all, delete-orphan")


class ProductVariant(Base, TimestampMixin):
    __tablename__ = "product_variants"
    __table_args__ = (
        Index("uq_product_variants_barcode", "barcode", unique=True, postgresql_where=text("barcode IS NOT NULL")),
        Index("uq_product_variants_upc", "upc", unique=True, postgresql_where=text("upc IS NOT NULL")),
        Index("uq_product_variants_ean", "ean", unique=True, postgresql_where=text("ean IS NOT NULL")),
        Index("ix_product_variants_attributes_gin", "attributes", postgresql_using="gin"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False, index=True)
    variant_name: Mapped[str] = mapped_column(String(200), nullable=False)  # e.g. "Red / XL"

    barcode: Mapped[str | None] = mapped_column(String(64))
    upc: Mapped[str | None] = mapped_column(String(64))
    ean: Mapped[str | None] = mapped_column(String(64))
    hsn_code: Mapped[str | None] = mapped_column(String(16), index=True)
    gst_category: Mapped[str | None] = mapped_column(String(40))
    country_of_origin: Mapped[str | None] = mapped_column(String(2))

    weight_grams: Mapped[int | None] = mapped_column(Integer)
    length_mm: Mapped[int | None] = mapped_column(Integer)
    width_mm: Mapped[int | None] = mapped_column(Integer)
    height_mm: Mapped[int | None] = mapped_column(Integer)
    fragile: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    shipping_class: Mapped[str | None] = mapped_column(String(40))

    manufacturer_warranty_months: Mapped[int | None] = mapped_column(Integer)
    serial_number_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    expiry_tracked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    attributes: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=VariantStatus.ACTIVE)

    product: Mapped["Product"] = relationship(back_populates="variants")


class ProductVariantAttributeValue(Base):
    __tablename__ = "product_variant_attribute_values"

    variant_id: Mapped[int] = mapped_column(ForeignKey("product_variants.id"), primary_key=True)
    attribute_value_id: Mapped[int] = mapped_column(ForeignKey("attribute_values.id"), primary_key=True)


class ProductImage(Base):
    __tablename__ = "product_images"
    __table_args__ = (
        Index(
            "uq_product_images_primary",
            "product_id",
            "variant_id",
            unique=True,
            postgresql_where=text("kind = 'PRIMARY'"),
            # NULLs must not be treated as distinct here — two product-level
            # PRIMARY images (variant_id IS NULL) would otherwise both pass.
            # Requires Postgres 15+ (this repo runs postgres:17-alpine).
            postgresql_nulls_not_distinct=True,
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False, index=True)
    variant_id: Mapped[int | None] = mapped_column(ForeignKey("product_variants.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default=ImageKind.GALLERY)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    video_url: Mapped[str | None] = mapped_column(Text)
    alt_text: Mapped[str | None] = mapped_column(String(255))
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    product: Mapped["Product"] = relationship(back_populates="images")
