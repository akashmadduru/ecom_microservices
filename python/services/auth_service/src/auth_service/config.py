from functools import lru_cache

from ecom_common.settings import BaseServiceSettings


class Settings(BaseServiceSettings):
    service_name: str = "auth-service"
    database_url: str = "postgresql+asyncpg://auth_user:auth_user@0.0.0.0:5432/auth_db"

    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    google_oauth2_client_id: str = ""
    google_oauth2_client_secret: str = ""
    google_oauth2_redirect_uri: str = "http://localhost:8080/api/v1/auth/sso/google/callback"


@lru_cache
def get_settings() -> Settings:
    return Settings()
