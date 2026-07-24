"""Redis sliding-window rate limiter (sorted-set algorithm, atomic via Lua)."""

import time

from redis.asyncio import Redis

_SLIDING_WINDOW_LUA = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])

redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count < limit then
    redis.call('ZADD', key, now, tostring(now) .. '-' .. tostring(math.random()))
    redis.call('PEXPIRE', key, window)
    return limit - count - 1
end
return -1
"""


class RateLimiter:
    def __init__(self, redis: Redis, window_ms: int = 60_000):
        self.redis = redis
        self.window_ms = window_ms
        self._script = self.redis.register_script(_SLIDING_WINDOW_LUA)

    async def check(self, identity: str, limit: int) -> tuple[bool, int]:
        """Returns (allowed, remaining). Fails open if Redis is unavailable."""
        try:
            remaining = await self._script(keys=[f"ratelimit:{identity}"], args=[int(time.time() * 1000), self.window_ms, limit])
        except Exception:
            return True, limit
        remaining = int(remaining)
        return (remaining >= 0), max(remaining, 0)
