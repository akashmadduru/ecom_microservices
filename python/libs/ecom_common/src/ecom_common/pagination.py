from math import ceil
from typing import Generic, TypeVar

from fastapi import Query
from pydantic import BaseModel
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

T = TypeVar("T")


class PageParams(BaseModel):
    page: int = Query(1, ge=1)
    page_size: int = Query(20, ge=1, le=100)


class Pagination(BaseModel):
    page: int
    page_size: int
    total_items: int
    total_pages: int
    has_previous: bool
    has_next: bool
    previous_page: int | None
    next_page: int | None


class Page(BaseModel, Generic[T]):
    items: list[T]
    pagination: Pagination


def build_pagination(page: int, page_size: int, total: int) -> Pagination:
    total_pages = ceil(total / page_size) if total else 1
    return Pagination(
        page=page,
        page_size=page_size,
        total_items=total,
        total_pages=total_pages,
        has_previous=page > 1,
        has_next=page < total_pages,
        previous_page=page - 1 if page > 1 else None,
        next_page=page + 1 if page < total_pages else None,
    )


async def paginate(db: AsyncSession, stmt: Select, params: PageParams) -> tuple[list, Pagination]:
    """Run a count + windowed select for the given statement."""
    total = (await db.execute(select(func.count()).select_from(stmt.order_by(None).subquery()))).scalar_one()
    offset = (params.page - 1) * params.page_size
    rows = (await db.execute(stmt.offset(offset).limit(params.page_size))).scalars().all()
    return list(rows), build_pagination(params.page, params.page_size, total)
