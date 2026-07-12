from functools import lru_cache

from ecom_common.settings import BaseServiceSettings


class Settings(BaseServiceSettings):
    service_name: str = "product-service"
    database_url: str = "postgresql+asyncpg://product_user:product_user@localhost:5441/product_db"

    product_cache_ttl_seconds: int = 300
    seed_csv_path: str = ""  # absolute path to products.csv; empty disables seeding
    seed_batch_size: int = 500  # rows committed per batch during CSV seeding


@lru_cache
def get_settings() -> Settings:
    return Settings()
