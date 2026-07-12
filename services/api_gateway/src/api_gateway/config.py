from functools import lru_cache

from ecom_common.settings import BaseServiceSettings


class Settings(BaseServiceSettings):
    service_name: str = "api-gateway"

    # Upstream base URLs (docker-compose service DNS by default; overridable per env)
    auth_service_url: str = "http://auth-service:8001"
    user_service_url: str = "http://user-service:8002"
    product_service_url: str = "http://product-service:8003"
    inventory_service_url: str = "http://inventory-service:8004"
    cart_service_url: str = "http://cart-service:8005"
    wishlist_service_url: str = "http://wishlist-service:8006"
    order_service_url: str = "http://order-service:8007"
    payment_service_url: str = "http://payment-service:8008"
    notification_service_url: str = "http://notification-service:8009"
    search_service_url: str = "http://search-service:8010"
    review_service_url: str = "http://review-service:8011"

    # cors_origins is inherited from BaseServiceSettings
    rate_limit_anonymous_per_minute: int = 100
    rate_limit_user_per_minute: int = 300

    upstream_connect_timeout_seconds: float = 2.0
    upstream_read_timeout_seconds: float = 15.0
    upstream_write_timeout_seconds: float = 10.0
    upstream_pool_timeout_seconds: float = 5.0
    circuit_breaker_failure_threshold: int = 5
    circuit_breaker_reset_timeout_seconds: float = 30.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
