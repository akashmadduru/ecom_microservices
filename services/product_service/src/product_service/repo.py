from ecom_common.repository import BaseRepository
from sqlalchemy import Select, select

from product_service.models import Product


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
        sort: str = "id",
    ) -> Select:
        stmt = select(Product)
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

        order_by = {
            "id": Product.id,
            "price": Product.retail_price,
            "-price": Product.retail_price.desc(),
            "rating": Product.rating.desc(),
            "name": Product.product_name,
            "newest": Product.created_at.desc(),
        }.get(sort, Product.id)
        return stmt.order_by(order_by)
