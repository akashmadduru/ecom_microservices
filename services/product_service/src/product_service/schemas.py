from decimal import Decimal

from ecom_common.pagination import Pagination
from pydantic import BaseModel, ConfigDict, Field


class ProductCreate(BaseModel):
    product_name: str = Field(..., min_length=1, max_length=500)
    uniq_id: str | None = None
    product_url: str | None = None
    retail_price: Decimal = Field(default=Decimal("0"), ge=0)
    discount: Decimal = Field(default=Decimal("0"), ge=0)
    image_urls: str | None = None
    description: str | None = None
    category: str | None = None
    sub_category: str | None = None
    brand: str | None = None


class ProductUpdate(BaseModel):
    product_name: str | None = Field(None, min_length=1, max_length=500)
    product_url: str | None = None
    retail_price: Decimal | None = Field(None, ge=0)
    discount: Decimal | None = Field(None, ge=0)
    image_urls: str | None = None
    description: str | None = None
    category: str | None = None
    sub_category: str | None = None
    brand: str | None = None


class ProductResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "id": 101,
                "uniq_id": "6bdc3f0c-1c1a-4c9a-9b8e-2f4b8b1a9e11",
                "product_name": "Ant Esports GW180 Corsa Gaming Racing Wheel",
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
            }
        },
    )

    id: int
    uniq_id: str | None
    product_name: str
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


class ProductPage(BaseModel):
    products: list[ProductResponse]
    pagination: Pagination
