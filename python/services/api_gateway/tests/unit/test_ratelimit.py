import pytest
from api_gateway.ratelimit import RateLimiter
from fakeredis import FakeAsyncRedis


@pytest.fixture
def limiter():
    return RateLimiter(FakeAsyncRedis(decode_responses=True), window_ms=60_000)


async def test_allows_up_to_limit(limiter):
    for i in range(5):
        allowed, remaining = await limiter.check("ip:1.2.3.4", limit=5)
        assert allowed, f"request {i} should be allowed"
    allowed, remaining = await limiter.check("ip:1.2.3.4", limit=5)
    assert not allowed
    assert remaining == 0


async def test_identities_are_independent(limiter):
    for _ in range(5):
        await limiter.check("ip:a", limit=5)
    allowed, _ = await limiter.check("ip:b", limit=5)
    assert allowed


async def test_fails_open_when_redis_down():
    class BrokenRedis:
        def register_script(self, script):
            async def boom(**kwargs):
                raise ConnectionError("redis down")

            return boom

    limiter = RateLimiter(BrokenRedis())
    allowed, _ = await limiter.check("ip:x", limit=1)
    assert allowed
