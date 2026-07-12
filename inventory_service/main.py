import logging
import os
import json
import asyncio
from fastapi import FastAPI, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import List, Optional
import aioredis
from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy import Column, String, Integer, Float

# Setup logs
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("inventory_service")

# Environment configs
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@postgres-inventory:5432/inventory_db")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis-cache:6379")
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_SERVERS", "kafka-broker:9092")

# Database Engine
engine = create_async_engine(DATABASE_URL, echo=True)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()

# Product model
class ProductDB(Base):
    __tablename__ = "products"
    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    price = Column(Float, nullable=False)
    stock = Column(Integer, default=0, nullable=False)
    description = Column(String)
    category = Column(String)

# Pydantic schemas
class ProductCreate(BaseModel):
    id: str
    name: str
    price: float
    stock: int
    description: Optional[str] = None
    category: Optional[str] = None

class ProductResponse(BaseModel):
    id: str
    name: str
    price: float
    stock: int
    description: Optional[str]
    category: Optional[str]
    class Config:
        from_attributes = True

app = FastAPI(
    title="E-Commerce Async Inventory Service",
    description="Microservice responsible for managing product stock, asynchronous product searches, and Saga inventory locking.",
    version="1.0.0"
)

redis: Optional[aioredis.Redis] = None
kafka_producer: Optional[AIOKafkaProducer] = None

# DB Dependency
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

# Background Kafka Consumer task for distributed Sagas
async def consume_order_events():
    consumer = AIOKafkaConsumer(
        "orders.create",
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        group_id="inventory_group",
        value_deserializer=lambda v: json.loads(v.decode("utf-8"))
    )
    
    # Retry cycle to handle bootstrap lag
    connected = False
    while not connected:
        try:
            await consumer.start()
            connected = True
            logger.info("Kafka consumer successfully connected to 'orders.create' topic.")
        except Exception as e:
            logger.warning(f"Kafka bootstrap unavailable, retrying in 5 seconds... Error: {e}")
            await asyncio.sleep(5)
            
    try:
        async for msg in consumer:
            event_type = msg.value.get("event") or "OrderCreated"
            payload = msg.value.get("payload")
            order_id = payload.get("order_id")
            items = payload.get("items")
            
            logger.info(f"Received Order Event [{event_type}] for Order ID: {order_id}")
            
            # Lock items asynchronously
            async with AsyncSessionLocal() as db:
                from sqlalchemy.future import select
                stock_valid = True
                unavail_products = []
                
                # Check all items
                for item in items:
                    p_id = item.get("productId")
                    qty = item.get("quantity")
                    
                    res = await db.execute(select(ProductDB).filter(ProductDB.id == p_id))
                    product = res.scalars().first()
                    
                    if not product or product.stock < qty:
                        stock_valid = False
                        unavail_products.append(p_id)
                
                # If all items are available, commit the reservation
                if stock_valid:
                    for item in items:
                        p_id = item.get("productId")
                        qty = item.get("quantity")
                        res = await db.execute(select(ProductDB).filter(ProductDB.id == p_id))
                        product = res.scalars().first()
                        product.stock -= qty
                    
                    await db.commit()
                    logger.info(f"Stock reserved successfully in database for order {order_id}.")
                    
                    # Evict products lists from Redis cache to keep state synced
                    await redis.delete("catalog:all")
                    for item in items:
                        await redis.delete(f"product:{item.get('productId')}")
                    
                    # Publish 'StockReserved' event to continue Saga
                    event_data = {
                        "event": "StockReserved",
                        "payload": {
                            "order_id": order_id,
                            "items": items
                        }
                    }
                    await kafka_producer.send_and_wait("inventory.reserve", json.dumps(event_data).encode("utf-8"))
                    logger.info(f"Published StockReserved event for order {order_id} to 'inventory.reserve' topic.")
                else:
                    # Publish 'InventoryReservationFailed' event to roll back Saga
                    logger.warning(f"Stock reservation failed for order {order_id} due to out of stock products: {unavail_products}")
                    event_data = {
                        "event": "InventoryReservationFailed",
                        "payload": {
                            "order_id": order_id,
                            "failed_products": unavail_products,
                            "reason": "OUT_OF_STOCK"
                        }
                    }
                    await kafka_producer.send_and_wait("inventory.failed", json.dumps(event_data).encode("utf-8"))
                    logger.info(f"Published InventoryReservationFailed event for order {order_id} to 'inventory.failed' topic.")
                    
    finally:
        await consumer.stop()

@app.on_event("startup")
async def startup():
    global redis, kafka_producer
    logger.info("Initializing Redis catalog caching...")
    redis = await aioredis.from_url(REDIS_URL, decode_responses=True)
    
    logger.info("Connecting database schemas...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    logger.info("Initializing async Kafka Producer...")
    kafka_producer = AIOKafkaProducer(bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS)
    await kafka_producer.start()
    
    # Start the event consumer background task
    asyncio.create_task(consume_order_events())
    logger.info("Inventory Service startup routines fully booted.")

@app.on_event("shutdown")
async def shutdown():
    global redis, kafka_producer
    if redis:
        await redis.close()
    if kafka_producer:
        await kafka_producer.stop()
    logger.info("Inventory connections terminated.")

# API Routes
@app.get("/products", response_model=List[ProductResponse])
async def get_products(db: AsyncSession = Depends(get_db)):
    # Check cache first
    cached = await redis.get("catalog:all")
    if cached:
        logger.info("Catalog fetch: REDIS CACHE HIT")
        return json.loads(cached)
        
    logger.info("Catalog fetch: REDIS CACHE MISS. Querying database asynchronously...")
    from sqlalchemy.future import select
    result = await db.execute(select(ProductDB))
    prods = result.scalars().all()
    
    # Write to Redis cache with TTL (1 minute)
    await redis.setex("catalog:all", 60, json.dumps([p.__dict__ for p in prods if hasattr(p, '__dict__')], default=str))
    return prods

@app.post("/products", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(product: ProductCreate, db: AsyncSession = Depends(get_db)):
    logger.info(f"Registering new product: {product.name} with code {product.id}")
    new_prod = ProductDB(
        id=product.id,
        name=product.name,
        price=product.price,
        stock=product.stock,
        description=product.description,
        category=product.category
    )
    db.add(new_prod)
    await db.commit()
    await db.refresh(new_prod)
    
    # Invalidate catalog list in cache
    await redis.delete("catalog:all")
    return new_prod
