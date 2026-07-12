from logger import log

import aioredis
from typing import Optional
from fastapi import FastAPI
from config import REDIS_URL
from db import engine, Base
from fastapi.concurrency import asynccontextmanager

redis: Optional[aioredis.Redis] = None
    
async def startup_event():
    global redis
    log.info("Connecting to Redis cache...")
    if not redis:
        redis = await aioredis.from_url(REDIS_URL, decode_responses=True)
    log.info("Redis cache connected successfully.")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    log.info("Auth Service database tables initialized successfully.")

async def shutdown_event():
    global redis
    if redis:
        await redis.close()
    log.info("Redis cache connection closed.")

@asynccontextmanager
async def lifespan(app: FastAPI):
    await startup_event()
    yield
    await shutdown_event()