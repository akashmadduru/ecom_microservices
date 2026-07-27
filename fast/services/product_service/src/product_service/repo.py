import re

from ecom_common.repository import BaseRepository
from sqlalchemy import Select, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from product_service.models import (
    AttributeValue,
    Brand,
    Category,
    Collection,
    Manufacturer,
    Product,
    ProductAttribute,
    ProductImage,
    ProductStatus,
    ProductVariant,
    Tag,
)


def slugify(value: str, *, sep: str = "-") -> str:
    """Normalize free text into a URL/label-safe slug. `sep="_"` produces
    underscore-joined labels, required for `Category.slug`/`path` segments
    since Postgres ltree labels only allow letters/digits/underscores — a
    hyphenated slug there would make `path::ltree` casts fail at query time
    (see `CategoryRepository.get_subtree` and the `Category` model comment)."""
    label = re.sub(r"[^a-z0-9]+", sep, (value or "").lower()).strip(sep)
    return label or "item"


async def generate_unique_slug(db: AsyncSession, model, base: str, *, sep: str = "-") -> str:
    """Slugify `base` and disambiguate against existing `model.slug` values by
    appending `{sep}2`, `{sep}3`, ... on collision."""
    base_slug = slugify(base, sep=sep)
    candidate = base_slug
    suffix = 2
    while (await db.execute(select(model.id).where(model.slug == candidate).limit(1))).scalars().first() is not None:
        candidate = f"{base_slug}{sep}{suffix}"
        suffix += 1
    return candidate


class ProductRepository(BaseRepository[Product]):
    model = Product

    def build_catalog_query(
        self,
        *,
        category: str | None = None,
        sub_category: str | None = None,
        brand: str | None = None,
        min_price: float | None = None,
        max_price: float | None = None,
        min_rating: float | None = None,
        brand_id: int | None = None,
        category_id: int | None = None,
        status: str | None = None,
        published_only: bool = True,
        sort: str = "id",
    ) -> Select:
        # Deleted products never appear in any catalog query, regardless of
        # what other filters are passed.
        stmt = select(Product).filter(Product.is_deleted == False)  # noqa: E712
        if category:
            stmt = stmt.filter(Product.category == category)
        if sub_category:
            stmt = stmt.filter(Product.sub_category == sub_category)
        if brand:
            stmt = stmt.filter(Product.brand == brand)
        if min_price is not None:
            stmt = stmt.filter(Product.retail_price >= min_price)
        if max_price is not None:
            stmt = stmt.filter(Product.retail_price <= max_price)
        if min_rating is not None:
            stmt = stmt.filter(Product.rating >= min_rating)
        if brand_id is not None:
            stmt = stmt.filter(Product.brand_id == brand_id)
        if category_id is not None:
            stmt = stmt.filter(Product.category_id == category_id)
        if status is not None:
            stmt = stmt.filter(Product.status == status)
        elif published_only:
            # Safe-by-default: public/anonymous browse must never surface
            # DRAFT/PENDING_APPROVAL/REJECTED/ARCHIVED products. Callers that
            # genuinely need the full catalog regardless of status (internal
            # search backfill) pass `published_only=False` explicitly.
            stmt = stmt.filter(Product.status == ProductStatus.PUBLISHED)

        order_by = {
            "id": Product.id,
            "price": Product.retail_price,
            "-price": Product.retail_price.desc(),
            "rating": Product.rating.desc(),
            "name": Product.title,
            "newest": Product.created_at.desc(),
        }.get(sort, Product.id)
        return stmt.order_by(order_by)


class BrandRepository(BaseRepository[Brand]):
    model = Brand


class ManufacturerRepository(BaseRepository[Manufacturer]):
    model = Manufacturer


class TagRepository(BaseRepository[Tag]):
    model = Tag


class CollectionRepository(BaseRepository[Collection]):
    model = Collection


class ProductAttributeRepository(BaseRepository[ProductAttribute]):
    model = ProductAttribute


class AttributeValueRepository(BaseRepository[AttributeValue]):
    model = AttributeValue


class ProductVariantRepository(BaseRepository[ProductVariant]):
    model = ProductVariant


class ProductImageRepository(BaseRepository[ProductImage]):
    model = ProductImage


class CategoryRepository(BaseRepository[Category]):
    model = Category

    async def get_children(self, parent_id: int | None) -> list[Category]:
        """Flat, one-level listing of direct children (or top-level categories
        when `parent_id` is None), ordered by `sort_order`."""
        stmt = select(Category).where(Category.parent_id == parent_id).order_by(Category.sort_order)
        return list((await self.db.execute(stmt)).scalars().all())

    async def get_subtree(self, category_id: int) -> list[Category]:
        """Category + all descendants, using the ltree-cast predicate against
        the plain-text `path` column (see the module-level comment on
        `Category` for why this stays a `String` column rather than a native
        ltree type). Bound as a plain Python `str` — the cast happens
        server-side in the query text, so nothing ltree-typed crosses the
        asyncpg wire."""
        category = await self.get(category_id)
        if category is None:
            return []
        stmt = (
            select(Category)
            .where(text("path::ltree <@ CAST(:p AS ltree)"))
            .params(p=category.path)
            .order_by(Category.path)
        )
        return list((await self.db.execute(stmt)).scalars().all())
