from typing import Annotated

from ecom_common.auth import TokenPayload, build_get_current_user
from ecom_common.db import get_db
from fastapi import Depends, Request
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from product_service.config import get_settings

get_current_user = build_get_current_user(get_settings)


def get_redis(request: Request) -> Redis:
    return request.app.state.redis


DbDep = Annotated[AsyncSession, Depends(get_db)]
RedisDep = Annotated[Redis, Depends(get_redis)]
CurrentUser = Annotated[TokenPayload, Depends(get_current_user)]
