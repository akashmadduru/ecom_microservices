from datetime import UTC, datetime

from ecom_common.auth import Role, TokenPayload, require_roles
from ecom_common.errors import ConflictError, DomainValidationError, ForbiddenError, NotFoundError
from ecom_common.events import EventType, Topics, make_event
from ecom_common.logging import get_logger
from ecom_common.pagination import PageParams
from ecom_common.redis import cache_get_json, cache_set_json
from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from product_service.catalog_seeder import seed_full_catalog
from product_service.config import get_settings
from product_service.deps import DbDep, RedisDep, get_current_user
from product_service.models import (
    AttributeValue,
    Brand,
    Category,
    Collection,
    CollectionProduct,
    Manufacturer,
    Product,
    ProductAttribute,
    ProductImage,
    ProductStatus,
    ProductVariant,
    ProductVariantAttributeValue,
    Tag,
)
from product_service.repo import (
    BrandRepository,
    CategoryRepository,
    CollectionRepository,
    ManufacturerRepository,
    ProductAttributeRepository,
    ProductImageRepository,
    ProductRepository,
    ProductVariantRepository,
    TagRepository,
    generate_unique_slug,
    slugify,
)
from product_service.schemas import (
    AttributeValueCreate,
    AttributeValueResponse,
    BrandCreate,
    BrandResponse,
    BrandUpdate,
    CategoryCreate,
    CategoryResponse,
    CategoryUpdate,
    CollectionCreate,
    CollectionResponse,
    CollectionUpdate,
    ManufacturerCreate,
    ManufacturerResponse,
    ManufacturerUpdate,
    ProductAttributeCreate,
    ProductAttributeResponse,
    ProductCreate,
    ProductImageCreate,
    ProductImageResponse,
    ProductPage,
    ProductResponse,
    ProductUpdate,
    ProductVariantCreate,
    ProductVariantResponse,
    ProductVariantUpdate,
    TagCreate,
    TagResponse,
)
from product_service.seeder import seed_from_csv

log = get_logger("product.routes")

router = APIRouter(prefix="/products", tags=["products"])
admin_router = APIRouter(prefix="/admin/products", tags=["admin"])
admin_catalog_router = APIRouter(prefix="/admin/catalog", tags=["admin"])
internal_router = APIRouter(prefix="/internal", tags=["internal"], include_in_schema=False)

require_seller = require_roles(get_current_user, Role.SELLER)
require_admin = require_roles(get_current_user, Role.ADMIN)

CACHE_PREFIX = "cache:product:"


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


async def _create_or_conflict(db: AsyncSession, obj, message: str):
    """Add + commit a new row, translating a unique-constraint violation into
    a 409 instead of letting it fall through as a raw 500."""
    db.add(obj)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise ConflictError(message) from exc
    await db.refresh(obj)
    return obj


async def _update_or_conflict(db: AsyncSession, obj, values: dict, message: str):
    for key, value in values.items():
        setattr(obj, key, value)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise ConflictError(message) from exc
    await db.refresh(obj)
    return obj


async def _delete_or_conflict(db: AsyncSession, obj, message: str) -> None:
    """Delete + commit, translating a FK RESTRICT violation (row still
    referenced elsewhere) into a 409 instead of an uncaught 500."""
    await db.delete(obj)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise ConflictError(message) from exc


async def _get_active_product(repo: ProductRepository, product_id: int) -> Product:
    """Fetch a product, treating soft-deleted rows exactly as if they were
    hard-deleted (404) — soft-delete must not be a visible behavior change to
    any existing caller. Does NOT filter by `status` — used by owner/admin
    write paths (via `_get_owned_product`) and trusted internal callers that
    must be able to see a product regardless of its lifecycle state."""
    product = await repo.get(product_id)
    if product is None or product.is_deleted:
        raise NotFoundError("Product not found")
    return product


async def _get_owned_product(repo: ProductRepository, product_id: int, user: TokenPayload) -> Product:
    product = await _get_active_product(repo, product_id)
    if user.role == Role.SELLER and product.seller_id not in (None, user.sub):
        raise ForbiddenError("Sellers can only modify their own products")
    return product


async def _get_visible_product(repo: ProductRepository, product_id: int) -> Product:
    """Fetch a product for a public/anonymous read path. Unlike
    `_get_active_product`, this also enforces `status == PUBLISHED` — a
    DRAFT/PENDING_APPROVAL/REJECTED/ARCHIVED product must 404 for public
    callers exactly as if it didn't exist, matching `build_catalog_query`'s
    `published_only` default. Not used on owner/admin/internal paths, which
    need to see a product's own drafts."""
    product = await _get_active_product(repo, product_id)
    if product.status != ProductStatus.PUBLISHED:
        raise NotFoundError("Product not found")
    return product


async def publish_product_event(request: Request, event_type: str, product: Product) -> None:
    producer = getattr(request.app.state, "producer", None)
    if producer is None:
        return
    try:
        await producer.publish(
            Topics.PRODUCT,
            make_event(
                event_type=event_type,
                producer=get_settings().service_name,
                partition_key=str(product.id),
                payload={
                    "product_id": product.id,
                    "title": product.title,
                    "slug": product.slug,
                    "description": product.description,
                    "brand": product.brand,
                    "category": product.category,
                    "sub_category": product.sub_category,
                    "retail_price": str(product.retail_price),
                    "discount": str(product.discount),
                    "rating": str(product.rating),
                    "review_count": product.review_count,
                    "image_urls": product.image_urls,
                    "brand_id": product.brand_id,
                    "category_id": product.category_id,
                    "manufacturer_id": product.manufacturer_id,
                    "status": product.status,
                },
            ),
        )
    except Exception:
        # Catalog writes must not fail because the broker is down; search/inventory reconcile via backfill.
        log.exception("product_event_publish_failed", event_type=event_type)


async def publish_variant_created_event(request: Request, variant: ProductVariant) -> None:
    producer = getattr(request.app.state, "producer", None)
    if producer is None:
        return
    try:
        await producer.publish(
            Topics.PRODUCT,
            make_event(
                event_type=EventType.PRODUCT_VARIANT_CREATED,
                producer=get_settings().service_name,
                partition_key=str(variant.product_id),
                payload={
                    "variant_id": variant.id,
                    "product_id": variant.product_id,
                    "variant_name": variant.variant_name,
                    "attributes": variant.attributes,
                },
            ),
        )
    except Exception:
        log.exception("product_variant_event_publish_failed", event_type=EventType.PRODUCT_VARIANT_CREATED)


# ---------------------------------------------------------------------------
# Products
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=ProductPage,
    summary="List products",
    description="Paginated catalog browse with optional category/sub_category/brand/price filters and sorting.",
)
async def list_products(
    db: DbDep,
    params: PageParams = Depends(),
    category: str | None = Query(None, description="Exact category match"),
    sub_category: str | None = Query(None, description="Exact sub-category match"),
    brand: str | None = Query(None, description="Exact brand match"),
    brand_id: int | None = Query(None, description="Taxonomy brand id"),
    category_id: int | None = Query(None, description="Taxonomy category id"),
    min_price: float | None = Query(None, description="Minimum retail price, inclusive"),
    max_price: float | None = Query(None, description="Maximum retail price, inclusive"),
    min_rating: float | None = Query(None, description="Minimum rating (cumulative filter), inclusive"),
    sort: str = Query("id", description="One of: id, price, -price, rating, name, newest"),
):
    repo = ProductRepository(db)
    stmt = repo.build_catalog_query(
        category=category,
        sub_category=sub_category,
        brand=brand,
        brand_id=brand_id,
        category_id=category_id,
        min_price=min_price,
        max_price=max_price,
        min_rating=min_rating,
        sort=sort,
    )
    items, pagination = await repo.list_paginated(params, stmt)
    return ProductPage(products=[ProductResponse.model_validate(p) for p in items], pagination=pagination)


# --- Taxonomy / master-data browse endpoints (registered before the generic
# `/{product_id}` route below, since Starlette matches path patterns in
# registration order — a literal single-segment path like `/brands` would
# otherwise be swallowed by `/{product_id}`). ---


@router.get("/brands", response_model=list[BrandResponse], summary="List active brands")
async def list_brands(db: DbDep):
    stmt = select(Brand).where(Brand.is_active == True).order_by(Brand.name)  # noqa: E712
    items = (await db.execute(stmt)).scalars().all()
    return [BrandResponse.model_validate(b) for b in items]


@router.get("/brands/{brand_id}", response_model=BrandResponse, responses={404: {"description": "Brand not found"}})
async def get_brand(brand_id: int, db: DbDep):
    brand = await BrandRepository(db).get(brand_id)
    if brand is None:
        raise NotFoundError("Brand not found")
    return BrandResponse.model_validate(brand)


@router.get("/manufacturers", response_model=list[ManufacturerResponse], summary="List manufacturers")
async def list_manufacturers(db: DbDep):
    stmt = select(Manufacturer).order_by(Manufacturer.name)
    items = (await db.execute(stmt)).scalars().all()
    return [ManufacturerResponse.model_validate(m) for m in items]


@router.get(
    "/manufacturers/{manufacturer_id}",
    response_model=ManufacturerResponse,
    responses={404: {"description": "Manufacturer not found"}},
)
async def get_manufacturer(manufacturer_id: int, db: DbDep):
    manufacturer = await ManufacturerRepository(db).get(manufacturer_id)
    if manufacturer is None:
        raise NotFoundError("Manufacturer not found")
    return ManufacturerResponse.model_validate(manufacturer)


@router.get("/categories", response_model=list[CategoryResponse], summary="List categories under a parent")
async def list_categories(db: DbDep, parent_id: int | None = Query(None, description="Omit for top-level categories")):
    children = await CategoryRepository(db).get_children(parent_id)
    return [CategoryResponse.model_validate(c) for c in children]


@router.get(
    "/categories/{category_id}", response_model=CategoryResponse, responses={404: {"description": "Category not found"}}
)
async def get_category(category_id: int, db: DbDep):
    category = await CategoryRepository(db).get(category_id)
    if category is None:
        raise NotFoundError("Category not found")
    return CategoryResponse.model_validate(category)


@router.get(
    "/categories/{category_id}/subtree",
    response_model=list[CategoryResponse],
    responses={404: {"description": "Category not found"}},
)
async def get_category_subtree(category_id: int, db: DbDep):
    # get_subtree's own ancestor-or-self predicate always includes the
    # category itself when found, so an empty result unambiguously means
    # "not found" — no need for a separate existence check up front.
    subtree = await CategoryRepository(db).get_subtree(category_id)
    if not subtree:
        raise NotFoundError("Category not found")
    return [CategoryResponse.model_validate(c) for c in subtree]


@router.get("/tags", response_model=list[TagResponse], summary="List tags")
async def list_tags(db: DbDep):
    stmt = select(Tag).order_by(Tag.name)
    items = (await db.execute(stmt)).scalars().all()
    return [TagResponse.model_validate(t) for t in items]


@router.get("/collections", response_model=list[CollectionResponse], summary="List active collections")
async def list_collections(db: DbDep):
    stmt = select(Collection).where(Collection.is_active == True).order_by(Collection.name)  # noqa: E712
    items = (await db.execute(stmt)).scalars().all()
    return [CollectionResponse.model_validate(c) for c in items]


@router.get(
    "/collections/{collection_id}",
    response_model=CollectionResponse,
    responses={404: {"description": "Collection not found"}},
)
async def get_collection(collection_id: int, db: DbDep):
    collection = await CollectionRepository(db).get(collection_id)
    if collection is None:
        raise NotFoundError("Collection not found")
    return CollectionResponse.model_validate(collection)


@router.get(
    "/collections/{collection_id}/products",
    response_model=ProductPage,
    responses={404: {"description": "Collection not found"}},
)
async def list_collection_products(collection_id: int, db: DbDep, params: PageParams = Depends()):
    collection = await CollectionRepository(db).get(collection_id)
    if collection is None:
        raise NotFoundError("Collection not found")
    stmt = (
        select(Product)
        .join(CollectionProduct, CollectionProduct.product_id == Product.id)
        .where(
            CollectionProduct.collection_id == collection_id,
            Product.is_deleted == False,  # noqa: E712
            Product.status == ProductStatus.PUBLISHED,
        )
        .order_by(CollectionProduct.sort_order)
    )
    items, pagination = await ProductRepository(db).list_paginated(params, stmt)
    return ProductPage(products=[ProductResponse.model_validate(p) for p in items], pagination=pagination)


@router.get("/attributes", response_model=list[ProductAttributeResponse], summary="List product attributes")
async def list_attributes(db: DbDep):
    stmt = select(ProductAttribute).order_by(ProductAttribute.sort_order)
    items = (await db.execute(stmt)).scalars().all()
    return [ProductAttributeResponse.model_validate(a) for a in items]


@router.get(
    "/attributes/{attribute_id}/values",
    response_model=list[AttributeValueResponse],
    responses={404: {"description": "Attribute not found"}},
)
async def list_attribute_values(attribute_id: int, db: DbDep):
    attribute = await ProductAttributeRepository(db).get(attribute_id)
    if attribute is None:
        raise NotFoundError("Attribute not found")
    stmt = select(AttributeValue).where(AttributeValue.attribute_id == attribute_id).order_by(AttributeValue.sort_order)
    items = (await db.execute(stmt)).scalars().all()
    return [AttributeValueResponse.model_validate(v) for v in items]


@router.get(
    "/{product_id}",
    response_model=ProductResponse,
    summary="Get a product",
    responses={404: {"description": "Product not found"}},
)
async def get_product(product_id: int, db: DbDep, redis: RedisDep):
    cache_key = f"{CACHE_PREFIX}{product_id}"
    if cached := await cache_get_json(redis, cache_key):
        return cached

    product = await _get_visible_product(ProductRepository(db), product_id)
    response = ProductResponse.model_validate(product)
    await cache_set_json(redis, cache_key, response.model_dump(mode="json"), get_settings().product_cache_ttl_seconds)
    return response


@router.post(
    "",
    response_model=ProductResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a product",
    description="Creates a catalog product owned by the calling seller. Requires SELLER or ADMIN role.",
    responses={403: {"description": "Caller is not a seller or admin"}},
)
async def create_product(
    request: Request,
    payload: ProductCreate,
    db: DbDep,
    user: TokenPayload = Depends(require_seller),
):
    data = payload.model_dump()
    slug = data.pop("slug", None) or await generate_unique_slug(db, Product, payload.title)
    # `model_dump()` (no exclude_unset) includes `attributes: None` for an
    # omitted field, which would pass an explicit None to the ORM constructor
    # and override the column's `default=dict` (only applies when the
    # attribute is never set at all) — the NOT NULL `attributes` column would
    # get NULL instead of `{}`, and ProductResponse.attributes: dict would
    # then reject it on read.
    data["attributes"] = data.get("attributes") or {}
    product = Product(**data, slug=slug, seller_id=user.sub, created_by=user.sub, updated_by=user.sub)
    product = await _create_or_conflict(db, product, "A product with this slug or uniq_id already exists")
    await publish_product_event(request, EventType.PRODUCT_CREATED, product)
    return ProductResponse.model_validate(product)


@router.put(
    "/{product_id}",
    response_model=ProductResponse,
    summary="Update a product",
    description="Sellers can only modify their own products; admins can modify any.",
    responses={403: {"description": "Not the owning seller"}, 404: {"description": "Product not found"}},
)
async def update_product(
    request: Request,
    product_id: int,
    payload: ProductUpdate,
    db: DbDep,
    redis: RedisDep,
    user: TokenPayload = Depends(require_seller),
):
    repo = ProductRepository(db)
    product = await _get_owned_product(repo, product_id, user)

    values = payload.model_dump(exclude_unset=True)
    values["updated_by"] = user.sub
    # Incremented on every update as an edit-count audit trail. Compare-and-
    # swap conflict detection (reject a write whose caller-supplied expected
    # version is stale) is deliberately not wired up in this phase — that
    # would be an API contract change (callers would need to submit the
    # version they read) and is deferred, not silently half-implemented.
    values["version"] = product.version + 1
    product = await _update_or_conflict(db, product, values, "A product with this slug already exists")
    await redis.delete(f"{CACHE_PREFIX}{product_id}")
    await publish_product_event(request, EventType.PRODUCT_UPDATED, product)
    return ProductResponse.model_validate(product)


@router.delete(
    "/{product_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a product",
    description="Sellers can only delete their own products; admins can delete any. Soft-delete: the row is kept.",
    responses={403: {"description": "Not the owning seller"}, 404: {"description": "Product not found"}},
)
async def delete_product(
    request: Request,
    product_id: int,
    db: DbDep,
    redis: RedisDep,
    user: TokenPayload = Depends(require_seller),
):
    repo = ProductRepository(db)
    product = await _get_owned_product(repo, product_id, user)

    product.is_deleted = True
    product.deleted_at = datetime.now(UTC)
    product.deleted_by = user.sub
    await db.commit()
    await redis.delete(f"{CACHE_PREFIX}{product_id}")
    # Publish only after a successful commit — matches every other mutation
    # in this file (via _create_or_conflict/_update_or_conflict); publishing
    # first would announce a delete that a failed commit never actually made.
    await publish_product_event(request, EventType.PRODUCT_DELETED, product)


# ---------------------------------------------------------------------------
# Product variants
# ---------------------------------------------------------------------------


@router.get(
    "/{product_id}/variants",
    response_model=list[ProductVariantResponse],
    responses={404: {"description": "Product not found"}},
)
async def list_variants(product_id: int, db: DbDep):
    await _get_visible_product(ProductRepository(db), product_id)
    stmt = select(ProductVariant).where(ProductVariant.product_id == product_id).order_by(ProductVariant.id)
    items = (await db.execute(stmt)).scalars().all()
    return [ProductVariantResponse.model_validate(v) for v in items]


@router.get(
    "/{product_id}/variants/{variant_id}",
    response_model=ProductVariantResponse,
    responses={404: {"description": "Product or variant not found"}},
)
async def get_variant(product_id: int, variant_id: int, db: DbDep):
    await _get_visible_product(ProductRepository(db), product_id)
    variant = await ProductVariantRepository(db).get(variant_id)
    if variant is None or variant.product_id != product_id:
        raise NotFoundError("Variant not found")
    return ProductVariantResponse.model_validate(variant)


@router.post(
    "/{product_id}/variants",
    response_model=ProductVariantResponse,
    status_code=status.HTTP_201_CREATED,
    responses={403: {"description": "Not the owning seller"}, 404: {"description": "Product not found"}},
)
async def create_variant(
    request: Request,
    product_id: int,
    payload: ProductVariantCreate,
    db: DbDep,
    user: TokenPayload = Depends(require_seller),
):
    await _get_owned_product(ProductRepository(db), product_id, user)

    data = payload.model_dump(exclude={"attribute_value_ids"})
    attribute_value_ids = payload.attribute_value_ids
    if attribute_value_ids:
        stmt = (
            select(func.count())
            .select_from(AttributeValue)
            .join(ProductAttribute, ProductAttribute.id == AttributeValue.attribute_id)
            .where(AttributeValue.id.in_(attribute_value_ids), ProductAttribute.is_variant_defining == True)  # noqa: E712
        )
        matched = (await db.execute(stmt)).scalar_one()
        if matched != len(set(attribute_value_ids)):
            raise DomainValidationError(
                "attribute_value_ids must reference existing AttributeValue rows on a variant-defining attribute"
            )

    variant = ProductVariant(product_id=product_id, **data)
    db.add(variant)
    try:
        # flush (not just commit) must be inside the try: a duplicate
        # barcode/upc/ean violates the partial unique index at flush time,
        # before commit is ever reached.
        await db.flush()
        for attribute_value_id in attribute_value_ids:
            db.add(ProductVariantAttributeValue(variant_id=variant.id, attribute_value_id=attribute_value_id))
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise ConflictError("A variant with this barcode/upc/ean already exists") from exc
    await db.refresh(variant)

    await publish_variant_created_event(request, variant)
    return ProductVariantResponse.model_validate(variant)


@router.put(
    "/{product_id}/variants/{variant_id}",
    response_model=ProductVariantResponse,
    responses={403: {"description": "Not the owning seller"}, 404: {"description": "Product or variant not found"}},
)
async def update_variant(
    product_id: int,
    variant_id: int,
    payload: ProductVariantUpdate,
    db: DbDep,
    user: TokenPayload = Depends(require_seller),
):
    await _get_owned_product(ProductRepository(db), product_id, user)
    variant = await ProductVariantRepository(db).get(variant_id)
    if variant is None or variant.product_id != product_id:
        raise NotFoundError("Variant not found")

    values = payload.model_dump(exclude_unset=True)
    variant = await _update_or_conflict(db, variant, values, "A variant with this barcode/upc/ean already exists")
    return ProductVariantResponse.model_validate(variant)


@router.delete(
    "/{product_id}/variants/{variant_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={403: {"description": "Not the owning seller"}, 404: {"description": "Product or variant not found"}},
)
async def delete_variant(
    product_id: int,
    variant_id: int,
    db: DbDep,
    user: TokenPayload = Depends(require_seller),
):
    await _get_owned_product(ProductRepository(db), product_id, user)
    variant = await ProductVariantRepository(db).get(variant_id)
    if variant is None or variant.product_id != product_id:
        raise NotFoundError("Variant not found")
    await db.delete(variant)
    await db.commit()


# ---------------------------------------------------------------------------
# Product images
# ---------------------------------------------------------------------------


@router.get(
    "/{product_id}/images",
    response_model=list[ProductImageResponse],
    responses={404: {"description": "Product not found"}},
)
async def list_images(product_id: int, db: DbDep):
    await _get_visible_product(ProductRepository(db), product_id)
    stmt = select(ProductImage).where(ProductImage.product_id == product_id).order_by(ProductImage.sort_order)
    items = (await db.execute(stmt)).scalars().all()
    return [ProductImageResponse.model_validate(i) for i in items]


@router.post(
    "/{product_id}/images",
    response_model=ProductImageResponse,
    status_code=status.HTTP_201_CREATED,
    responses={403: {"description": "Not the owning seller"}, 404: {"description": "Product not found"}},
)
async def create_image(
    product_id: int,
    payload: ProductImageCreate,
    db: DbDep,
    user: TokenPayload = Depends(require_seller),
):
    await _get_owned_product(ProductRepository(db), product_id, user)
    if payload.variant_id is not None:
        variant = await ProductVariantRepository(db).get(payload.variant_id)
        if variant is None or variant.product_id != product_id:
            raise NotFoundError("Variant not found")

    image = ProductImage(product_id=product_id, **payload.model_dump())
    image = await _create_or_conflict(db, image, "Only one PRIMARY image is allowed per product/variant")
    return ProductImageResponse.model_validate(image)


@router.delete(
    "/{product_id}/images/{image_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={403: {"description": "Not the owning seller"}, 404: {"description": "Product or image not found"}},
)
async def delete_image(
    product_id: int,
    image_id: int,
    db: DbDep,
    user: TokenPayload = Depends(require_seller),
):
    await _get_owned_product(ProductRepository(db), product_id, user)
    image = await ProductImageRepository(db).get(image_id)
    if image is None or image.product_id != product_id:
        raise NotFoundError("Image not found")
    await db.delete(image)
    await db.commit()


# ---------------------------------------------------------------------------
# Admin: seed
# ---------------------------------------------------------------------------


@admin_router.post("/seed", dependencies=[Depends(require_admin)])
async def seed_products(db: DbDep):
    settings = get_settings()
    if not settings.seed_csv_path:
        return {"message": "Seeding disabled: SEED_CSV_PATH not configured.", "seeded": 0}
    return await seed_from_csv(db, settings.seed_csv_path, batch_size=settings.seed_batch_size)


@admin_catalog_router.post("/seed", dependencies=[Depends(require_admin)])
async def seed_catalog(db: DbDep):
    settings = get_settings()
    return await seed_full_catalog(db, settings.seed_catalog_dir, batch_size=settings.seed_batch_size)


# ---------------------------------------------------------------------------
# Admin: brands
# ---------------------------------------------------------------------------


@admin_router.post(
    "/brands", response_model=BrandResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)]
)
async def create_brand(payload: BrandCreate, db: DbDep):
    brand = await _create_or_conflict(db, Brand(**payload.model_dump()), "A brand with this name or slug already exists")
    return BrandResponse.model_validate(brand)


@admin_router.put(
    "/brands/{brand_id}",
    response_model=BrandResponse,
    dependencies=[Depends(require_admin)],
    responses={404: {"description": "Brand not found"}},
)
async def update_brand(brand_id: int, payload: BrandUpdate, db: DbDep):
    brand = await BrandRepository(db).get(brand_id)
    if brand is None:
        raise NotFoundError("Brand not found")
    brand = await _update_or_conflict(
        db, brand, payload.model_dump(exclude_unset=True), "A brand with this name or slug already exists"
    )
    return BrandResponse.model_validate(brand)


@admin_router.delete(
    "/brands/{brand_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
    responses={404: {"description": "Brand not found"}, 409: {"description": "Brand is referenced by products"}},
)
async def delete_brand(brand_id: int, db: DbDep):
    brand = await BrandRepository(db).get(brand_id)
    if brand is None:
        raise NotFoundError("Brand not found")
    await _delete_or_conflict(db, brand, "Brand is referenced by existing products and cannot be deleted")


# ---------------------------------------------------------------------------
# Admin: manufacturers
# ---------------------------------------------------------------------------


@admin_router.post(
    "/manufacturers",
    response_model=ManufacturerResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def create_manufacturer(payload: ManufacturerCreate, db: DbDep):
    manufacturer = await _create_or_conflict(
        db, Manufacturer(**payload.model_dump()), "A manufacturer with this name already exists"
    )
    return ManufacturerResponse.model_validate(manufacturer)


@admin_router.put(
    "/manufacturers/{manufacturer_id}",
    response_model=ManufacturerResponse,
    dependencies=[Depends(require_admin)],
    responses={404: {"description": "Manufacturer not found"}},
)
async def update_manufacturer(manufacturer_id: int, payload: ManufacturerUpdate, db: DbDep):
    manufacturer = await ManufacturerRepository(db).get(manufacturer_id)
    if manufacturer is None:
        raise NotFoundError("Manufacturer not found")
    manufacturer = await _update_or_conflict(
        db, manufacturer, payload.model_dump(exclude_unset=True), "A manufacturer with this name already exists"
    )
    return ManufacturerResponse.model_validate(manufacturer)


@admin_router.delete(
    "/manufacturers/{manufacturer_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
    responses={
        404: {"description": "Manufacturer not found"},
        409: {"description": "Manufacturer is referenced by brands or products"},
    },
)
async def delete_manufacturer(manufacturer_id: int, db: DbDep):
    manufacturer = await ManufacturerRepository(db).get(manufacturer_id)
    if manufacturer is None:
        raise NotFoundError("Manufacturer not found")
    await _delete_or_conflict(
        db, manufacturer, "Manufacturer is referenced by existing brands or products and cannot be deleted"
    )


# ---------------------------------------------------------------------------
# Admin: categories
# ---------------------------------------------------------------------------


@admin_router.post(
    "/categories",
    response_model=CategoryResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
    responses={404: {"description": "parent_id given but not found"}},
)
async def create_category(payload: CategoryCreate, db: DbDep):
    parent = None
    if payload.parent_id is not None:
        parent = await CategoryRepository(db).get(payload.parent_id)
        if parent is None:
            raise NotFoundError("Parent category not found")

    # Category slug/path segments must stay ltree-label-safe (letters, digits,
    # underscores only) since `path` is built by joining them with dots and is
    # used directly in `path::ltree` casts — see `CategoryRepository.get_subtree`.
    label = await generate_unique_slug(db, Category, payload.name, sep="_")
    path = label if parent is None else f"{parent.path}.{label}"
    depth = 0 if parent is None else parent.depth + 1

    category = Category(
        parent_id=payload.parent_id,
        name=payload.name,
        slug=label,
        path=path,
        depth=depth,
        sort_order=payload.sort_order,
    )
    category = await _create_or_conflict(db, category, "A category with this name already exists under this parent")
    return CategoryResponse.model_validate(category)


@admin_router.put(
    "/categories/{category_id}",
    response_model=CategoryResponse,
    dependencies=[Depends(require_admin)],
    responses={404: {"description": "Category not found"}},
)
async def update_category(category_id: int, payload: CategoryUpdate, db: DbDep):
    """Deliberately minimal: only `is_active`/`sort_order` are mutable here.
    Renaming (and any re-parenting) would require recomputing `slug`/`path`/
    `depth` for the whole subtree, which is out of scope for this phase."""
    category = await CategoryRepository(db).get(category_id)
    if category is None:
        raise NotFoundError("Category not found")
    values = payload.model_dump(exclude_unset=True)
    for key, value in values.items():
        setattr(category, key, value)
    await db.commit()
    await db.refresh(category)
    return CategoryResponse.model_validate(category)


@admin_router.delete(
    "/categories/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
    responses={404: {"description": "Category not found"}, 409: {"description": "Category has children or products"}},
)
async def delete_category(category_id: int, db: DbDep):
    repo = CategoryRepository(db)
    category = await repo.get(category_id)
    if category is None:
        raise NotFoundError("Category not found")

    children = await repo.get_children(category_id)
    if children:
        raise ConflictError("Category has child categories and cannot be deleted")

    product_count = (
        await db.execute(select(func.count()).select_from(Product).where(Product.category_id == category_id))
    ).scalar_one()
    if product_count > 0:
        raise ConflictError("Category has products referencing it and cannot be deleted")

    await repo.delete(category)


# ---------------------------------------------------------------------------
# Admin: tags
# ---------------------------------------------------------------------------


@admin_router.post(
    "/tags", response_model=TagResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)]
)
async def create_tag(payload: TagCreate, db: DbDep):
    tag = await _create_or_conflict(db, Tag(**payload.model_dump()), "A tag with this name or slug already exists")
    return TagResponse.model_validate(tag)


@admin_router.delete(
    "/tags/{tag_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
    responses={404: {"description": "Tag not found"}, 409: {"description": "Tag is applied to existing products"}},
)
async def delete_tag(tag_id: int, db: DbDep):
    tag = await TagRepository(db).get(tag_id)
    if tag is None:
        raise NotFoundError("Tag not found")
    await _delete_or_conflict(db, tag, "Tag is applied to existing products and cannot be deleted")


# ---------------------------------------------------------------------------
# Admin: collections
# ---------------------------------------------------------------------------


@admin_router.post(
    "/collections",
    response_model=CollectionResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def create_collection(payload: CollectionCreate, db: DbDep):
    collection = await _create_or_conflict(
        db, Collection(**payload.model_dump()), "A collection with this slug already exists"
    )
    return CollectionResponse.model_validate(collection)


@admin_router.put(
    "/collections/{collection_id}",
    response_model=CollectionResponse,
    dependencies=[Depends(require_admin)],
    responses={404: {"description": "Collection not found"}},
)
async def update_collection(collection_id: int, payload: CollectionUpdate, db: DbDep):
    collection = await CollectionRepository(db).get(collection_id)
    if collection is None:
        raise NotFoundError("Collection not found")
    collection = await _update_or_conflict(
        db, collection, payload.model_dump(exclude_unset=True), "A collection with this slug already exists"
    )
    return CollectionResponse.model_validate(collection)


@admin_router.delete(
    "/collections/{collection_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
    responses={404: {"description": "Collection not found"}, 409: {"description": "Collection still has products"}},
)
async def delete_collection(collection_id: int, db: DbDep):
    collection = await CollectionRepository(db).get(collection_id)
    if collection is None:
        raise NotFoundError("Collection not found")
    await _delete_or_conflict(db, collection, "Collection still has products linked and cannot be deleted")


@admin_router.post(
    "/collections/{collection_id}/products/{product_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
    responses={404: {"description": "Collection or product not found"}, 409: {"description": "Already in collection"}},
)
async def add_collection_product(collection_id: int, product_id: int, db: DbDep):
    collection = await CollectionRepository(db).get(collection_id)
    if collection is None:
        raise NotFoundError("Collection not found")
    await _get_active_product(ProductRepository(db), product_id)

    link = CollectionProduct(collection_id=collection_id, product_id=product_id)
    await _create_or_conflict(db, link, "Product is already in this collection")


@admin_router.delete(
    "/collections/{collection_id}/products/{product_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
    responses={404: {"description": "Product is not in this collection"}},
)
async def remove_collection_product(collection_id: int, product_id: int, db: DbDep):
    result = await db.execute(
        delete(CollectionProduct).where(
            CollectionProduct.collection_id == collection_id, CollectionProduct.product_id == product_id
        )
    )
    await db.commit()
    if result.rowcount == 0:
        raise NotFoundError("Product is not in this collection")


# ---------------------------------------------------------------------------
# Admin: attributes
# ---------------------------------------------------------------------------


@admin_router.post(
    "/attributes",
    response_model=ProductAttributeResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def create_attribute(payload: ProductAttributeCreate, db: DbDep):
    attribute = await _create_or_conflict(
        db, ProductAttribute(**payload.model_dump()), "An attribute with this name or code already exists"
    )
    return ProductAttributeResponse.model_validate(attribute)


@admin_router.post(
    "/attributes/{attribute_id}/values",
    response_model=AttributeValueResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
    responses={404: {"description": "Attribute not found"}},
)
async def create_attribute_value(attribute_id: int, payload: AttributeValueCreate, db: DbDep):
    attribute = await ProductAttributeRepository(db).get(attribute_id)
    if attribute is None:
        raise NotFoundError("Attribute not found")

    value_slug = payload.slug or slugify(payload.value)
    attribute_value = AttributeValue(
        attribute_id=attribute_id, value=payload.value, slug=value_slug, sort_order=payload.sort_order
    )
    attribute_value = await _create_or_conflict(
        db, attribute_value, "This value already exists for this attribute"
    )
    return AttributeValueResponse.model_validate(attribute_value)


# ---------------------------------------------------------------------------
# Internal (service-to-service, not gateway-routable)
# ---------------------------------------------------------------------------


@internal_router.get("/products/{product_id}", response_model=ProductResponse)
async def internal_get_product(product_id: int, db: DbDep):
    """Service-to-service product lookup (cart price snapshots, search backfill)."""
    product = await _get_active_product(ProductRepository(db), product_id)
    return ProductResponse.model_validate(product)


@internal_router.get("/products", response_model=ProductPage)
async def internal_list_products(db: DbDep, params: PageParams = Depends()):
    """Paged catalog dump for the search-service backfill. Trusted internal
    caller — sees every non-deleted product regardless of lifecycle status
    (a search index needs to know about DRAFT/PENDING_APPROVAL products too,
    even if it chooses not to surface them), unlike the public product
    endpoints which default to PUBLISHED-only."""
    repo = ProductRepository(db)
    items, pagination = await repo.list_paginated(params, repo.build_catalog_query(published_only=False))
    return ProductPage(products=[ProductResponse.model_validate(p) for p in items], pagination=pagination)
