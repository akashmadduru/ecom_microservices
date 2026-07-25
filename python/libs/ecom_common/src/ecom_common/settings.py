import os

from pydantic_settings import BaseSettings, SettingsConfigDict


class BaseServiceSettings(BaseSettings):
    """Base configuration shared by every service.

    `jwt_secret` is intentionally required: services must fail fast at boot
    rather than fall back to a hardcoded development secret.

    The env file itself is selectable via `ENV_FILE` (defaults to `.env`), so
    an environment-specific file (`.env.staging`, `.env.production`, ...) can
    be pointed at without code changes: `ENV_FILE=.env.staging uvicorn ...`.
    Actual environment variables always take precedence over the file's
    contents — in a real staging/prod deployment, secrets should be injected
    by the platform (Docker/Kubernetes/CI/CD/secret manager) rather than
    shipped in a file at all; `.env.production` is a template only.
    """

    model_config = SettingsConfigDict(env_file=os.getenv("ENV_FILE", ".env"), env_file_encoding="utf-8", extra="ignore")

    service_name: str = "ecom-service"
    env: str = "dev"
    log_level: str = "INFO"

    database_url: str = ""
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

    otel_exporter_endpoint: str = ""
    otel_enabled: bool = False

    @property
    def is_prod(self) -> bool:
        return self.env == "prod"
