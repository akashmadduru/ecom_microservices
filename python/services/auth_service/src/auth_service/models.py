import uuid

from ecom_common.auth import Role
from ecom_common.db import Base, TimestampMixin
from sqlalchemy import Boolean, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)  # null for SSO-only accounts
    role: Mapped[str] = mapped_column(String(30), default=Role.CUSTOMER.value, nullable=False)
    provider: Mapped[str] = mapped_column(String(30), default="local", nullable=False)
    provider_sub: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
