"""Smoke tests for main.py's app assembly and lifespan wiring. Both
EventProducer.start() and the consumer's start task are backgrounded
(non-blocking, self-retrying) by design, so entering/exiting the lifespan
context manager doesn't require a live Postgres/Redis/Kafka — matching how
product_service/auth_service tolerate broker/db absence at boot."""

from inventory_service import main as main_module


def test_app_metadata_and_tags():
    app = main_module.app
    assert app.title == "E-Commerce Inventory Service"
    schema = app.openapi()
    tag_names = {t["name"] for t in schema.get("tags", [])}
    assert {"inventory", "admin", "internal"} <= tag_names


def test_protected_routes_carry_bearer_security_scheme():
    schema = main_module.app.openapi()
    assert "HTTPBearer" in schema["components"]["securitySchemes"]
    create_op = schema["paths"]["/inventory"]["post"]
    assert create_op["security"] == [{"HTTPBearer": []}]
    list_op = schema["paths"]["/inventory"]["get"]
    assert "security" not in list_op


async def test_lifespan_starts_and_stops_without_real_infra():
    import asyncio

    app = main_module.app
    async with main_module.lifespan(app):
        assert app.state.session_factory is not None
        assert app.state.redis is not None
        assert app.state.producer is not None
        assert app.state.consumer is not None

    # Shutdown requested cancellation of the backgrounded consumer start task;
    # let the event loop actually process it before asserting.
    await asyncio.sleep(0)
    assert app.state.consumer_start_task.cancelling() or app.state.consumer_start_task.done()
