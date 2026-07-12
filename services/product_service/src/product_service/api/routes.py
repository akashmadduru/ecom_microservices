from ecom_common.auth import Role, TokenPayload, require_roles
from ecom_common.errors import ForbiddenError, NotFoundError
from ecom_common.events import EventType, Topics, make_event
from ecom_common.logging import get_logger
from ecom_common.pagination import PageParams
from ecom_common.redis import cache_get_json, cache_set_json
from fastapi import APIRouter, Depends, Query, Request, status

from product_service.config import get_settings
from product_service.deps import DbDep, RedisDep, get_current_user
from product_service.models import Product
from product_service.repo import ProductRepository
from product_service.schemas import ProductCreate, ProductPage, ProductResponse, ProductUpdate
from product_service.seeder import seed_from_csv

log = get_logger("product.routes")

router = APIRouter(prefix="/products", tags=["products"])
admin_router = APIRouter(prefix="/admin/products", tags=["admin"])
internal_router = APIRouter(prefix="/internal", tags=["internal"], include_in_schema=False)

require_seller = require_roles(get_current_user, Role.SELLER)
require_admin = require_roles(get_current_user, Role.ADMIN)

CACHE_PREFIX = "cache:product:"


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
                    "product_name": product.product_name,
                    "description": product.description,
                    "brand": product.brand,
                    "category": product.category,
                    "sub_category": product.sub_category,
                    "retail_price": str(product.retail_price),
                    "discount": str(product.discount),
                    "rating": str(product.rating),
                    "review_count": product.review_count,
                    "image_urls": product.image_urls,
                },
            ),
        )
    except Exception:
        # Catalog writes must not fail because the broker is down; search/inventory reconcile via backfill.
        log.exception("product_event_publish_failed", event_type=event_type)


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
    min_price: float | None = Query(None, description="Minimum retail price, inclusive"),
    max_price: float | None = Query(None, description="Maximum retail price, inclusive"),
    sort: str = Query("id", description="One of: id, price, -price, rating, name, newest"),
):
    repo = ProductRepository(db)
    stmt = repo.build_catalog_query(
        category=category, sub_category=sub_category, brand=brand, min_price=min_price, max_price=max_price, sort=sort
    )
    items, pagination = await repo.list_paginated(params, stmt)
    return ProductPage(products=[ProductResponse.model_validate(p) for p in items], pagination=pagination)


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

    product = await ProductRepository(db).get(product_id)
    if product is None:
        raise NotFoundError("Product not found")
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
    product = Product(**payload.model_dump(), seller_id=user.sub)
    product = await ProductRepository(db).create(product)
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
    product = await repo.get(product_id)
    if product is None:
        raise NotFoundError("Product not found")
    if user.role == Role.SELLER and product.seller_id not in (None, user.sub):
        raise ForbiddenError("Sellers can only modify their own products")

    product = await repo.update(product, **payload.model_dump(exclude_unset=True))
    await redis.delete(f"{CACHE_PREFIX}{product_id}")
    await publish_product_event(request, EventType.PRODUCT_UPDATED, product)
    return ProductResponse.model_validate(product)


@router.delete(
    "/{product_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a product",
    description="Sellers can only delete their own products; admins can delete any.",
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
    product = await repo.get(product_id)
    if product is None:
        raise NotFoundError("Product not found")
    if user.role == Role.SELLER and product.seller_id not in (None, user.sub):
        raise ForbiddenError("Sellers can only delete their own products")

    await publish_product_event(request, EventType.PRODUCT_DELETED, product)
    await repo.delete(product)
    await redis.delete(f"{CACHE_PREFIX}{product_id}")


@admin_router.post("/seed", dependencies=[Depends(require_admin)])
async def seed_products(db: DbDep):
    settings = get_settings()
    if not settings.seed_csv_path:
        return {"message": "Seeding disabled: SEED_CSV_PATH not configured.", "seeded": 0}
    return await seed_from_csv(db, settings.seed_csv_path, batch_size=settings.seed_batch_size)


@internal_router.get("/products/{product_id}", response_model=ProductResponse)
async def internal_get_product(product_id: int, db: DbDep):
    """Service-to-service product lookup (cart price snapshots, search backfill)."""
    product = await ProductRepository(db).get(product_id)
    if product is None:
        raise NotFoundError("Product not found")
    return ProductResponse.model_validate(product)


@internal_router.get("/products", response_model=ProductPage)
async def internal_list_products(db: DbDep, params: PageParams = Depends()):
    """Paged catalog dump for the search-service backfill."""
    repo = ProductRepository(db)
    items, pagination = await repo.list_paginated(params)
    return ProductPage(products=[ProductResponse.model_validate(p) for p in items], pagination=pagination)
