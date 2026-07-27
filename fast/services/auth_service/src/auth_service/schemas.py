from ecom_common.auth import Role
from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserSignup(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr | None = None
    password: str = Field(..., min_length=8, max_length=128)
    role: Role | None = None  # defaults to CUSTOMER; privileged roles require an ADMIN caller (enforced in service)


class UserResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "id": "42",
                "username": "alice",
                "email": "alice@example.com",
                "role": "CUSTOMER",
                "provider": "local",
                "is_active": True,
            }
        },
    )

    id: str
    username: str
    email: str | None = None
    role: Role
    provider: str
    is_active: bool


class TokenPair(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                "token_type": "bearer",
                "expires_in": 900,
                "role": "CUSTOMER",
            }
        }
    )

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    role: Role


class RefreshRequest(BaseModel):
    refresh_token: str


class GoogleLoginRequest(BaseModel):
    token: str  # Google ID token obtained by the frontend


class SSOLoginRequest(BaseModel):
    provider: str = Field(..., min_length=2, max_length=50)
    subject: str = Field(..., min_length=1, max_length=255)
    email: EmailStr | None = None
    display_name: str | None = None
