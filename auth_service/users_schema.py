from typing import Optional

from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8, max_length=128)
    role: Optional[str] = None
    created_at: Optional[str] = None
    hashed_password: Optional[str] = None
    is_active: Optional[bool] = True


class UserSignin(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8, max_length=128)
    role: Optional[str] = None
    email: Optional[str] = None
    provider: Optional[str] = "local"


class UserResponse(BaseModel):
    id: int
    username: str
    role: str
    provider: Optional[str] = None

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    expires_in: int


class SSOLoginRequest(BaseModel):
    provider: str = Field(..., min_length=2, max_length=50)
    subject: str = Field(..., min_length=1, max_length=255)
    email: Optional[str] = None
    display_name: Optional[str] = None