"""Redis-backed login sessions, refresh-token rotation state, and jti denylist.

Key schema:
    session:{sid}            hash {user_id, created_at, user_agent, current_refresh_jti}, TTL = refresh lifetime
    refresh:{jti}            -> sid, TTL = refresh lifetime
    denylist:jti:{jti}       -> "1", TTL = remaining access-token lifetime
    user_sessions:{user_id}  set of sids
"""

from datetime import UTC, datetime

from ecom_common.auth import DENYLIST_PREFIX
from redis.asyncio import Redis


class SessionStore:
    def __init__(self, redis: Redis, refresh_ttl_seconds: int):
        self.redis = redis
        self.refresh_ttl = refresh_ttl_seconds

    async def create_session(self, *, sid: str, user_id: str, refresh_jti: str, user_agent: str = "") -> None:
        pipe = self.redis.pipeline()
        pipe.hset(
            f"session:{sid}",
            mapping={
                "user_id": user_id,
                "created_at": datetime.now(UTC).isoformat(),
                "user_agent": user_agent[:300],
                "current_refresh_jti": refresh_jti,
            },
        )
        pipe.expire(f"session:{sid}", self.refresh_ttl)
        pipe.set(f"refresh:{refresh_jti}", sid, ex=self.refresh_ttl)
        pipe.sadd(f"user_sessions:{user_id}", sid)
        await pipe.execute()

    async def get_session(self, sid: str) -> dict | None:
        data = await self.redis.hgetall(f"session:{sid}")
        return data or None

    async def rotate_refresh(self, *, sid: str, old_jti: str, new_jti: str) -> None:
        pipe = self.redis.pipeline()
        pipe.delete(f"refresh:{old_jti}")
        pipe.set(f"refresh:{new_jti}", sid, ex=self.refresh_ttl)
        pipe.hset(f"session:{sid}", "current_refresh_jti", new_jti)
        pipe.expire(f"session:{sid}", self.refresh_ttl)
        await pipe.execute()

    async def destroy_session(self, sid: str) -> None:
        session = await self.redis.hgetall(f"session:{sid}")
        pipe = self.redis.pipeline()
        if session:
            if jti := session.get("current_refresh_jti"):
                pipe.delete(f"refresh:{jti}")
            if user_id := session.get("user_id"):
                pipe.srem(f"user_sessions:{user_id}", sid)
        pipe.delete(f"session:{sid}")
        await pipe.execute()

    async def destroy_all_sessions(self, user_id: str) -> int:
        sids = await self.redis.smembers(f"user_sessions:{user_id}")
        for sid in sids:
            await self.destroy_session(sid)
        await self.redis.delete(f"user_sessions:{user_id}")
        return len(sids)

    async def denylist_access_jti(self, jti: str, remaining_seconds: int) -> None:
        if remaining_seconds > 0:
            await self.redis.set(f"{DENYLIST_PREFIX}{jti}", "1", ex=remaining_seconds)
