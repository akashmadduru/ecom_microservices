import csv
from math import ceil
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from products import Products
from product_schema import ProductCreate

async def get_product_count(db: AsyncSession):
    return await db.execute(select(func.count()).select_from(Products))

async def create_product(db: AsyncSession, product: ProductCreate):
    try:
        p = Products(**product.model_dump())
        db.add(p)
        await db.commit()
        await db.refresh(p)
    except Exception as e:
        print(e)

async def get_products(db: AsyncSession, page: int, page_size: int):
    total_result = await get_product_count(db)
    total = total_result.scalar_one()
    total_pages = ceil(total / page_size) if total else 1
    offset = (page - 1) * page_size
    products_result = await db.execute(
        select(Products)
        .order_by(Products.id)
        .offset(offset)
        .limit(page_size)
    )
    products = products_result.scalars().all()
    pagination =  {
       "page": page,
       "page_size": page_size,
       "total_items": total,
       "total_pages": total_pages,
       "has_previous": page > 1,
       "has_next": page < total_pages,
       "previous_page": page - 1 if page > 1 else None,
       "next_page": page + 1 if page < total_pages else None
    }
    return { "products": products, "pagination": pagination }

async def get_product(db: AsyncSession, id: int):
    product = (
        await db.execute(select(Products).filter(Products.id == id))
    ).scalars().first()
    return product

async def init_products(db: AsyncSession):
    try:
        count = await get_product_count(db)
        if count.scalar_one() == 0:
            with open('products.csv', mode='r', encoding='utf-8') as file:
                csv_reader = csv.DictReader(file)
                products = list(csv_reader)
                for p in products:
                    uniq_id = p['uniq_id']
                    created_at = p['created_at']
                    product_name = p['product_name']
                    try:
                        image_urls = p['image_urls']
                    except:
                        image_urls = '' 
                    product_url = p['product_url']
                    description = p['description']
                    category = 'product'
                    sub_category = 'sub-product'
                    try:
                        retail_price = float(p['retail_price'])
                        discount = float(p['discount'])
                    except:
                        retail_price = 0
                        discount = 0
                    try:
                        rating = int(p['rating'])
                    except:
                        rating = 0
                    brand = p['brand']
                    sub_category = p['sub_category']
                    category = p['category']
                    product_copy = ProductCreate(
                        uniq_id=uniq_id, created_at=created_at, product_name=product_name,
                        retail_price=retail_price, discount=discount, image_urls=image_urls,
                        product_url=product_url, description=description, category=category,
                        sub_category=sub_category, rating=rating, brand=brand
                    )
                    await create_product(db, product_copy)
            print('products initialized successfully!')
            return {"message": "Products initialized successfully!"}
        else:
            print('product already exists in the database.')
            return {"message": "Products already exist in the database."}

    except Exception as e:
        print(f"Error initializing products: {e}")
        return {"message": f"Error initializing products: {e}"}

