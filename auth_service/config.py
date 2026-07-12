import os

ALGORITHM = "HS256"
JWT_AUDIENCE = os.getenv("JWT_AUDIENCE", "ecom-gateway")
JWT_ISSUER = os.getenv("JWT_ISSUER", "ecom-auth-service")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis-cache:6379")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
SECRET_KEY = os.getenv("JWT_SECRET", "super-secret-production-key-change-me-123")
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://auth_user:auth_user@localhost:5431/auth_db")