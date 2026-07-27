from functools import lru_cache

from ecom_common.settings import BaseServiceSettings


class Settings(BaseServiceSettings):
    service_name: str = "product-service"
    database_url: str = "postgresql+asyncpg://product_user:product_user@localhost:5441/product_db"

    product_cache_ttl_seconds: int = 300
    seed_csv_path: str = ""  # absolute path to products.csv; empty disables seeding

    seed_batch_size: int = 500  # rows committed per batch during CSV/catalog seeding

    auto_seed_on_startup: bool = True
    seed_catalog_dir: str = "seed/catalog"  # absolute path to seed/catalog/; empty disables

    redis_url: str = "redis://localhost:6379"
    kafka_bootstrap_servers: str = "localhost:29092"

    jwt_secret: str = "test-jwt-secret"
    jwt_algorithm: str = "HS256"
    jwt_issuer: str = "ecom-auth-service"
    jwt_audience: str = "ecom-gateway"

    cors_origins: list = [
        "http://localhost:5173", 
        "http://localhost:5174", 
        "http://localhost:5175"
    ]


@lru_cache
def get_settings() -> Settings:
    return Settings()
