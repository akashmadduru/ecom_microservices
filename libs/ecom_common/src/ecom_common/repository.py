from typing import Any, Generic, TypeVar

from sqlalchemy import Select, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ecom_common.db import Base
from ecom_common.pagination import Page, PageParams, Pagination, paginate

M = TypeVar("M", bound=Base)


class BaseRepository(Generic[M]):
    model: type[M]

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, id_: Any) -> M | None:
        return await self.db.get(self.model, id_)

    async def get_by(self, **filters: Any) -> M | None:
        stmt = select(self.model).filter_by(**filters)
        return (await self.db.execute(stmt)).scalars().first()

    async def list_paginated(self, params: PageParams, stmt: Select | None = None) -> tuple[list[M], Pagination]:
        stmt = stmt if stmt is not None else select(self.model)
        return await paginate(self.db, stmt, params)

    async def count(self) -> int:
        return (await self.db.execute(select(func.count()).select_from(self.model))).scalar_one()

    async def create(self, obj: M) -> M:
        self.db.add(obj)
        await self.db.commit()
        await self.db.refresh(obj)
        return obj

    async def update(self, obj: M, **values: Any) -> M:
        for key, value in values.items():
            setattr(obj, key, value)
        await self.db.commit()
        await self.db.refresh(obj)
        return obj

    async def delete(self, obj: M) -> None:
        await self.db.delete(obj)
        await self.db.commit()

    async def delete_by(self, **filters: Any) -> int:
        result = await self.db.execute(delete(self.model).filter_by(**filters))
        await self.db.commit()
        return result.rowcount


__all__ = ["BaseRepository", "Page", "PageParams", "Pagination"]
