from api_gateway.config import Settings
from api_gateway.route_table import AUTHENTICATED, PUBLIC, build_route_table, match_route
from ecom_common.auth import Role


def routes():
    return build_route_table(Settings(jwt_secret="x", _env_file=None))


def test_longest_prefix_wins():
    table = routes()
    assert match_route(table, "/products/42").upstream_name == "product-service"
    assert match_route(table, "/admin/products/seed").upstream_name == "product-service"


def test_unknown_prefix_no_match():
    assert match_route(routes(), "/nope") is None


def test_prefix_must_match_on_boundary():
    # /productsfoo must NOT match /products
    assert match_route(routes(), "/productsfoo") is None


def test_product_policies():
    route = match_route(routes(), "/products")
    assert route.policy_for("GET") == PUBLIC
    assert route.policy_for("POST") == {Role.SELLER, Role.ADMIN}


def test_orders_policies():
    route = match_route(routes(), "/orders")
    assert route.policy_for("POST") == {Role.CUSTOMER}
    assert route.policy_for("GET") == AUTHENTICATED


def test_auth_is_public():
    assert match_route(routes(), "/auth/signin").policy_for("POST") == PUBLIC
