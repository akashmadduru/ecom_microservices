from datetime import datetime
from decimal import Decimal

from ecom_common.pagination import Pagination
from pydantic import BaseModel, ConfigDict, Field

from product_service.models import ImageKind, ProductStatus, VariantStatus

# ---------------------------------------------------------------------------
# Product
# ---------------------------------------------------------------------------


class ProductCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    slug: str | None = None  # server-generates from `title` if omitted
    uniq_id: str | None = None
    product_url: str | None = None
    retail_price: Decimal = Field(default=Decimal("0"), ge=0)
    discount: Decimal = Field(default=Decimal("0"), ge=0)
    image_urls: str | None = None
    description: str | None = None
    category: str | None = None
    sub_category: str | None = None
    brand: str | None = None
    brand_id: int | None = None
    manufacturer_id: int | None = None
    category_id: int | None = None
    seo_title: str | None = None
    seo_description: str | None = None
    canonical_url: str | None = None
    meta_keywords: list[str] | None = None
    attributes: dict | None = None


class ProductUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=500)
    slug: str | None = None
    product_url: str | None = None
    retail_price: Decimal | None = Field(None, ge=0)
    discount: Decimal | None = Field(None, ge=0)
    image_urls: str | None = None
    description: str | None = None
    category: str | None = None
    sub_category: str | None = None
    brand: str | None = None
    brand_id: int | None = None
    manufacturer_id: int | None = None
    category_id: int | None = None
    seo_title: str | None = None
    seo_description: str | None = None
    canonical_url: str | None = None
    meta_keywords: list[str] | None = None
    attributes: dict | None = None


class ProductResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "id": 101,
                "uniq_id": "6bdc3f0c-1c1a-4c9a-9b8e-2f4b8b1a9e11",
                "title": "Ant Esports GW180 Corsa Gaming Racing Wheel",
                "slug": "ant-esports-gw180-corsa-gaming-racing-wheel",
                "product_url": "https://cdn.example.com/products/101/main.jpg",
                "retail_price": "89.99",
                "discount": "10.00",
                "image_urls": "https://cdn.example.com/products/101/main.jpg",
                "description": "Force-feedback racing wheel with pedals.",
                "category": "Gaming",
                "sub_category": "Accessories",
                "brand": "Ant Esports",
                "rating": "4.30",
                "review_count": 128,
                "seller_id": "42",
                "brand_id": 7,
                "manufacturer_id": 3,
                "category_id": 12,
                "status": "PUBLISHED",
                "seo_title": "Ant Esports GW180 Corsa Racing Wheel | Buy Online",
                "seo_description": "Force-feedback racing wheel with pedals, best price guaranteed.",
                "canonical_url": "https://shop.example.com/p/ant-esports-gw180-corsa-gaming-racing-wheel",
                "meta_keywords": ["racing wheel", "gaming accessories"],
                "attributes": {"connector": "USB-A", "feedback": "force-feedback"},
            }
        },
    )

    id: int
    uniq_id: str | None
    title: str
    slug: str
    product_url: str | None
    retail_price: Decimal
    discount: Decimal
    image_urls: str | None
    description: str | None
    category: str | None
    sub_category: str | None
    brand: str | None
    rating: Decimal
    review_count: int
    seller_id: str | None
    brand_id: int | None
    manufacturer_id: int | None
    category_id: int | None
    status: ProductStatus
    seo_title: str | None
    seo_description: str | None
    canonical_url: str | None
    meta_keywords: list[str] | None
    attributes: dict
    created_at: datetime
    updated_at: datetime


class ProductPage(BaseModel):
    products: list[ProductResponse]
    pagination: Pagination


# ---------------------------------------------------------------------------
# Manufacturer
# ---------------------------------------------------------------------------


class ManufacturerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    country_of_origin: str | None = Field(None, min_length=2, max_length=2)
    contact_info: dict | None = None


class ManufacturerUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    country_of_origin: str | None = Field(None, min_length=2, max_length=2)
    contact_info: dict | None = None


class ManufacturerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    country_of_origin: str | None
    contact_info: dict | None


# ---------------------------------------------------------------------------
# Brand
# ---------------------------------------------------------------------------


class BrandCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=1, max_length=220)
    logo_url: str | None = None
    manufacturer_id: int | None = None
    description: str | None = None
    is_active: bool = True


class BrandUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    slug: str | None = Field(None, min_length=1, max_length=220)
    logo_url: str | None = None
    manufacturer_id: int | None = None
    description: str | None = None
    is_active: bool | None = None


class BrandResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    logo_url: str | None
    manufacturer_id: int | None
    description: str | None
    is_active: bool


# ---------------------------------------------------------------------------
# Category
# ---------------------------------------------------------------------------


class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    parent_id: int | None = None
    sort_order: int = 0


class CategoryUpdate(BaseModel):
    """Deliberately minimal: renaming a category's `name`/`parent_id` would
    require recomputing `slug`/`path`/`depth` for the whole subtree, which is
    out of scope for this phase. Only toggling visibility/ordering is safe."""

    is_active: bool | None = None
    sort_order: int | None = None


class CategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    parent_id: int | None
    name: str
    slug: str
    path: str
    depth: int
    is_active: bool
    sort_order: int


# ---------------------------------------------------------------------------
# Collection
# ---------------------------------------------------------------------------


class CollectionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=1, max_length=220)
    description: str | None = None
    is_active: bool = True
    starts_at: datetime | None = None
    ends_at: datetime | None = None


class CollectionUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    slug: str | None = Field(None, min_length=1, max_length=220)
    description: str | None = None
    is_active: bool | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None


class CollectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    description: str | None
    is_active: bool
    starts_at: datetime | None
    ends_at: datetime | None


# ---------------------------------------------------------------------------
# Tag
# ---------------------------------------------------------------------------


class TagCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    slug: str = Field(..., min_length=1, max_length=90)


class TagResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str


# ---------------------------------------------------------------------------
# ProductAttribute / AttributeValue
# ---------------------------------------------------------------------------


class ProductAttributeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    code: str = Field(..., min_length=1, max_length=100)
    is_variant_defining: bool = False
    sort_order: int = 0


class ProductAttributeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    code: str
    is_variant_defining: bool
    sort_order: int


class AttributeValueCreate(BaseModel):
    value: str = Field(..., min_length=1, max_length=150)
    slug: str | None = Field(None, max_length=160)  # server-generates from `value` if omitted
    sort_order: int = 0


class AttributeValueResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    attribute_id: int
    value: str
    slug: str
    sort_order: int


# ---------------------------------------------------------------------------
# ProductVariant
# ---------------------------------------------------------------------------


class ProductVariantCreate(BaseModel):
    variant_name: str = Field(..., min_length=1, max_length=200)
    barcode: str | None = None
    upc: str | None = None
    ean: str | None = None
    hsn_code: str | None = None
    gst_category: str | None = None
    country_of_origin: str | None = Field(None, min_length=2, max_length=2)
    weight_grams: int | None = None
    length_mm: int | None = None
    width_mm: int | None = None
    height_mm: int | None = None
    fragile: bool = False
    shipping_class: str | None = None
    manufacturer_warranty_months: int | None = None
    serial_number_required: bool = False
    expiry_tracked: bool = False
    attributes: dict = Field(default_factory=dict)
    is_default: bool = False
    status: VariantStatus = VariantStatus.ACTIVE
    attribute_value_ids: list[int] = Field(default_factory=list)


class ProductVariantUpdate(BaseModel):
    variant_name: str | None = Field(None, min_length=1, max_length=200)
    barcode: str | None = None
    upc: str | None = None
    ean: str | None = None
    hsn_code: str | None = None
    gst_category: str | None = None
    country_of_origin: str | None = Field(None, min_length=2, max_length=2)
    weight_grams: int | None = None
    length_mm: int | None = None
    width_mm: int | None = None
    height_mm: int | None = None
    fragile: bool | None = None
    shipping_class: str | None = None
    manufacturer_warranty_months: int | None = None
    serial_number_required: bool | None = None
    expiry_tracked: bool | None = None
    attributes: dict | None = None
    is_default: bool | None = None
    status: VariantStatus | None = None


class ProductVariantResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    variant_name: str
    barcode: str | None
    upc: str | None
    ean: str | None
    hsn_code: str | None
    gst_category: str | None
    country_of_origin: str | None
    weight_grams: int | None
    length_mm: int | None
    width_mm: int | None
    height_mm: int | None
    fragile: bool
    shipping_class: str | None
    manufacturer_warranty_months: int | None
    serial_number_required: bool
    expiry_tracked: bool
    attributes: dict
    is_default: bool
    status: VariantStatus


# ---------------------------------------------------------------------------
# ProductImage
# ---------------------------------------------------------------------------


class ProductImageCreate(BaseModel):
    variant_id: int | None = None
    kind: ImageKind = ImageKind.GALLERY
    url: str = Field(..., min_length=1)
    video_url: str | None = None
    alt_text: str | None = None
    sort_order: int = 0


class ProductImageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    variant_id: int | None
    kind: ImageKind
    url: str
    video_url: str | None
    alt_text: str | None
    sort_order: int


__all__ = [
    "ProductCreate",
    "ProductUpdate",
    "ProductResponse",
    "ProductPage",
    "ManufacturerCreate",
    "ManufacturerUpdate",
    "ManufacturerResponse",
    "BrandCreate",
    "BrandUpdate",
    "BrandResponse",
    "CategoryCreate",
    "CategoryUpdate",
    "CategoryResponse",
    "CollectionCreate",
    "CollectionUpdate",
    "CollectionResponse",
    "TagCreate",
    "TagResponse",
    "ProductAttributeCreate",
    "ProductAttributeResponse",
    "AttributeValueCreate",
    "AttributeValueResponse",
    "ProductVariantCreate",
    "ProductVariantUpdate",
    "ProductVariantResponse",
    "ProductImageCreate",
    "ProductImageResponse",
]
