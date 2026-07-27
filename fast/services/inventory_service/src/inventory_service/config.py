from functools import lru_cache

from ecom_common.settings import BaseServiceSettings


class Settings(BaseServiceSettings):
    service_name: str = "inventory-service"
    database_url: str = "postgresql+asyncpg://inventory_user:inventory_user@localhost:5441/inventory_db"

    inventory_cache_ttl_seconds: int = 60
    health_report_cache_ttl_seconds: int = 60


@lru_cache
def get_settings() -> Settings:
    return Settings()
