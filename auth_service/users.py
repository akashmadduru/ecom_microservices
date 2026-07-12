from sqlalchemy import Boolean, Column, Integer, String

from db import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, index=True, nullable=False)
    email = Column(String(255), nullable=True, index=True)
    role = Column(String(30), default="USER", nullable=False)
    created_at = Column(String(50), nullable=False)
    updated_at = Column(String(50), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    provider = Column(String(30), default="local", nullable=False)
    sso_subject = Column(String(255), nullable=True, unique=True, index=True)

