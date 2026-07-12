import json
import uuid
from typing import Any

from redis.asyncio import ConnectionPool, Redis

# Atomically release a lock only if we still own it.
_RELEASE_LUA = """
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
"""


def create_redis(url: str, *, max_connections: int = 20) -> Redis:
    pool = ConnectionPool.from_url(url, max_connections=max_connections, decode_responses=True)
    return Redis(connection_pool=pool)


class RedisLock:
    """Distributed lock: SET NX PX acquire, Lua-checked release.

    Usage:
        async with RedisLock(redis, "lock:inventory:42", ttl_ms=5000) as acquired:
            if not acquired: raise ...
    """

    def __init__(self, redis: Redis, key: str, ttl_ms: int = 10_000):
        self.redis = redis
        self.key = key
        self.ttl_ms = ttl_ms
        self.token = uuid.uuid4().hex
        self.acquired = False

    async def acquire(self) -> bool:
        self.acquired = bool(await self.redis.set(self.key, self.token, nx=True, px=self.ttl_ms))
        return self.acquired

    async def release(self) -> None:
        if self.acquired:
            await self.redis.eval(_RELEASE_LUA, 1, self.key, self.token)
            self.acquired = False

    async def __aenter__(self) -> bool:
        return await self.acquire()

    async def __aexit__(self, *exc) -> None:
        await self.release()


async def cache_get_json(redis: Redis, key: str) -> Any | None:
    raw = await redis.get(key)
    return json.loads(raw) if raw else None


async def cache_set_json(redis: Redis, key: str, value: Any, ttl_seconds: int) -> None:
    await redis.setex(key, ttl_seconds, json.dumps(value, default=str))
