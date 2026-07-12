import logging
import os
import json
import asyncio
from fastapi import FastAPI, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy import Column, String, Integer, Float

# Setup logs
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("order_service")

# Environment configs
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@postgres-orders:5432/orders_db")
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_SERVERS", "kafka-broker:9092")

# Database Engine
engine = create_async_engine(DATABASE_URL, echo=True)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()

# Order model
class OrderDB(Base):
    __tablename__ = "orders"
    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, nullable=False)
    total_amount = Column(Float, nullable=False)
    status = Column(String, default="PENDING", nullable=False) # PENDING, RESERVED, CONFIRMED, FAILED
    items_json = Column(String, nullable=False) # stored as json list

# Pydantic schemas
class OrderItem(BaseModel):
    productId: str
    quantity: int

class OrderCreate(BaseModel):
    userId: str
    items: List[OrderItem]
    totalAmount: float

class OrderResponse(BaseModel):
    id: str
    user_id: str
    total_amount: float
    status: str
    items: List[Dict[str, Any]]
    class Config:
        from_attributes = True

app = FastAPI(
    title="E-Commerce Distributed Orders Service",
    description="Microservice responsible for order entries, transactions tracking, and state reconciliation via Kafka Sagas.",
    version="1.0.0"
)

kafka_producer: Optional[AIOKafkaProducer] = None

# DB Dependency
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

# Background Kafka Consumer task for listening to downstream inventory reservation results
async def consume_inventory_events():
    consumer = AIOKafkaConsumer(
        "inventory.reserve", "inventory.failed",
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        group_id="orders_group",
        value_deserializer=lambda v: json.loads(v.decode("utf-8"))
    )
    
    connected = False
    while not connected:
        try:
            await consumer.start()
            connected = True
            logger.info("Kafka consumer successfully connected to 'inventory.reserve' and 'inventory.failed' topics.")
        except Exception as e:
            logger.warning(f"Kafka broker offline, retrying in 5 seconds... Error: {e}")
            await asyncio.sleep(5)
            
    try:
        async for msg in consumer:
            topic = msg.topic
            event_type = msg.value.get("event")
            payload = msg.value.get("payload")
            order_id = payload.get("order_id")
            
            logger.info(f"Received topic event [{event_type}] from topic '{topic}' for Order ID: {order_id}")
            
            async with AsyncSessionLocal() as db:
                from sqlalchemy.future import select
                res = await db.execute(select(OrderDB).filter(OrderDB.id == order_id))
                order = res.scalars().first()
                
                if order:
                    if topic == "inventory.reserve":
                        order.status = "CONFIRMED"
                        logger.info(f"Saga Successful: Order {order_id} moved to CONFIRMED state in database.")
                    elif topic == "inventory.failed":
                        order.status = "FAILED"
                        logger.warning(f"Saga Compensating Action: Order {order_id} failed due to: {payload.get('reason')}. Setting status to FAILED.")
                    
                    await db.commit()
                else:
                    logger.error(f"Critical inconsistency: Event received for order {order_id} but order not found in database.")
                    
    finally:
        await consumer.stop()

@app.on_event("startup")
async def startup():
    global kafka_producer
    logger.info("Connecting order databases...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    logger.info("Initializing async Kafka Producer...")
    kafka_producer = AIOKafkaProducer(bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS)
    await kafka_producer.start()
    
    # Start inventory response listeners in background thread loop
    asyncio.create_task(consume_inventory_events())
    logger.info("Order Service background transaction loops initialized.")

@app.on_event("shutdown")
async def shutdown():
    global kafka_producer
    if kafka_producer:
        await kafka_producer.stop()
    logger.info("Order Service connection loops disconnected.")

# Endpoints
@app.post("/orders", status_code=status.HTTP_202_ACCEPTED)
async def create_new_order(order: OrderCreate, db: AsyncSession = Depends(get_db)):
    logger.info(f"Received order placement request for user {order.userId} for amount ${order.totalAmount}")
    
    order_id = f"ord-{os.urandom(3).hex().upper()}"
    items_list = [{"productId": item.productId, "quantity": item.quantity} for item in order.items]
    
    # Save PENDING order asynchronously in PostgreSQL
    new_order = OrderDB(
        id=order_id,
        user_id=order.userId,
        total_amount=order.totalAmount,
        status="PENDING",
        items_json=json.dumps(items_list)
    )
    db.add(new_order)
    await db.commit()
    logger.info(f"Order {order_id} persisted in PostgreSQL with PENDING status. Initiating distributed transaction Saga...")
    
    # Publish event OrderCreated
    event_payload = {
        "event": "OrderCreated",
        "payload": {
            "order_id": order_id,
            "user_id": order.userId,
            "items": items_list,
            "total_amount": order.totalAmount
        }
    }
    await kafka_producer.send_and_wait("orders.create", json.dumps(event_payload).encode("utf-8"))
    logger.info(f"Kafka Event Published to 'orders.create' for Order {order_id}.")
    
    # Return 202 Accepted representing asynchronous queue processing
    return {
        "order_id": order_id,
        "status": "PENDING",
        "message": "Order processing started asynchronously. Listen to event bus or poll status for results."
    }

@app.get("/orders/{order_id}")
async def get_order_details(order_id: str, db: AsyncSession = Depends(get_db)):
    from sqlalchemy.future import select
    result = await db.execute(select(OrderDB).filter(OrderDB.id == order_id))
    order = result.scalars().first()
    if not order:
        raise HTTPException(status_code=404, detail="Order record not found.")
        
    return {
        "id": order.id,
        "user_id": order.user_id,
        "total_amount": order.total_amount,
        "status": order.status,
        "items": json.loads(order.items_json)
    }
