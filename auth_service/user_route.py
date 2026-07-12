from db import get_db
from fastapi import APIRouter, Depends, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from security import get_current_user
from user_service import UserService
from users_schema import Token, UserResponse, UserSignin, SSOLoginRequest

router = APIRouter(prefix="/auth", tags=["auth"])

user_service = UserService()


@router.post("/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(user: UserSignin, db: AsyncSession = Depends(get_db)):
    return await user_service.register(user, db)


@router.post("/signin", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    return await user_service.login_for_access_token(form_data, db)


@router.post("/sso/login", response_model=Token)
async def sso_login(payload: SSOLoginRequest, db: AsyncSession = Depends(get_db)):
    return await user_service.sso_login(payload, db)


@router.get("/validate", response_model=UserResponse)
async def validate_token(current_user: dict = Depends(get_current_user)):
    return {"id": current_user["id"], "username": current_user["username"], "role": current_user["role"]}


@router.get("/users/me", response_model=UserResponse)
async def read_users_me(current_user: dict = Depends(get_current_user)):
    return {"id": current_user["id"], "username": current_user["username"], "role": current_user["role"]}


@router.get("/admin/diagnostics")
async def admin_diagnostics(current_user: dict = Depends(get_current_user)):
    return await user_service.admin_diagnostics(current_user)