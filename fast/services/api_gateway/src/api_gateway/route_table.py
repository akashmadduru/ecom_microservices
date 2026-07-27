"""Static routing table: /api/v1/<prefix> -> upstream service + access policy.

Policy semantics:
  PUBLIC          — no token required
  AUTHENTICATED   — any valid token
  {Role, ...}     — token role must be in the set (ADMIN always allowed)

`/internal/*` paths are never routable through the gateway.
"""

from dataclasses import dataclass, field

from ecom_common.auth import Role

from api_gateway.config import Settings

PUBLIC = "public"
AUTHENTICATED = "authenticated"


@dataclass(frozen=True)
class Route:
    prefix: str  # path prefix after /api/v1
    upstream: str  # base URL
    upstream_name: str
    # method -> policy; "*" is the fallback
    policies: dict = field(default_factory=dict)

    def policy_for(self, method: str):
        return self.policies.get(method.upper(), self.policies.get("*", AUTHENTICATED))


def build_route_table(settings: Settings) -> list[Route]:
    return [
        Route(
            prefix="/auth",
            upstream=settings.auth_service_url,
            upstream_name="auth-service",
            policies={"*": PUBLIC},  # auth service enforces its own token requirements (logout, users/me, ...)
        ),
        Route(
            prefix="/users",
            upstream=settings.user_service_url,
            upstream_name="user-service",
            policies={"*": AUTHENTICATED},
        ),
        Route(
            prefix="/products",
            upstream=settings.product_service_url,
            upstream_name="product-service",
            policies={"GET": PUBLIC, "*": {Role.SELLER, Role.ADMIN}},
        ),
        Route(
            prefix="/admin",
            upstream=settings.product_service_url,
            upstream_name="product-service",
            policies={"*": {Role.ADMIN}},
        ),
        Route(
            prefix="/inventory",
            upstream=settings.inventory_service_url,
            upstream_name="inventory-service",
            policies={"GET": PUBLIC, "*": {Role.SELLER, Role.ADMIN}},
        ),
        Route(
            prefix="/cart",
            upstream=settings.cart_service_url,
            upstream_name="cart-service",
            policies={"*": PUBLIC},  # guest carts allowed; service distinguishes guests from users
        ),
        Route(
            prefix="/wishlist",
            upstream=settings.wishlist_service_url,
            upstream_name="wishlist-service",
            policies={"*": {Role.CUSTOMER}},
        ),
        Route(
            prefix="/orders",
            upstream=settings.order_service_url,
            upstream_name="order-service",
            policies={"POST": {Role.CUSTOMER}, "*": AUTHENTICATED},
        ),
        Route(
            prefix="/payments",
            upstream=settings.payment_service_url,
            upstream_name="payment-service",
            policies={"*": AUTHENTICATED},
        ),
        Route(
            prefix="/notifications",
            upstream=settings.notification_service_url,
            upstream_name="notification-service",
            policies={"*": AUTHENTICATED},
        ),
        Route(
            prefix="/search",
            upstream=settings.search_service_url,
            upstream_name="search-service",
            policies={"*": PUBLIC},
        ),
        Route(
            prefix="/reviews",
            upstream=settings.review_service_url,
            upstream_name="review-service",
            policies={"GET": PUBLIC, "*": {Role.CUSTOMER, Role.SUPPORT}},
        ),
    ]


def match_route(routes: list[Route], path: str) -> Route | None:
    """Longest-prefix match on the path after /api/v1."""
    best: Route | None = None
    for route in routes:
        if path == route.prefix or path.startswith(route.prefix + "/"):
            if best is None or len(route.prefix) > len(best.prefix):
                best = route
    return best
