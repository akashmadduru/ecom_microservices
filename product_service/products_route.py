from fastapi import Depends, APIRouter
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from product_schema import ProductCreate
from products_repo import create_product, get_products, get_product, init_products

router = APIRouter(prefix="/products", tags=["products"])

@router.get("/init")
async def init_products_api(db: AsyncSession = Depends(get_db)):
    return await init_products(db)

@router.post("/")
async def create_product_api(product: ProductCreate, db: AsyncSession = Depends(get_db)):
    return create_product(db, product)

@router.get("/")
async def get_products_api(db: AsyncSession = Depends(get_db), page: int = 1, page_size: int = 20):
    return await get_products(db, page, page_size)

@router.get("/{id}")
async def get_product_api(db: AsyncSession = Depends(get_db), id: int = 1):
    return await get_product(db, id)
