from typing import Annotated

from ecom_common.auth import TokenPayload, build_get_current_user
from ecom_common.db import get_db
from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from auth_service.config import get_settings
from auth_service.service import AuthService

get_current_token = build_get_current_user(get_settings)


def get_auth_service(request: Request) -> AuthService:
    return request.app.state.auth_service


DbDep = Annotated[AsyncSession, Depends(get_db)]
AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]
CurrentToken = Annotated[TokenPayload, Depends(get_current_token)]
