# Event-Driven Microservices Architecture

This document explains the event-driven architecture implemented across the three microservices: Products, Cart, and Inventory.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     API Gateway (8080)                      │
│                   (Spring Cloud Gateway)                    │
└───────┬───────────────────────────────────────────────────┬─┘
        │                                                   │
        ▼                                                   ▼
┌──────────────────┐                             ┌──────────────────┐
│ Products Service │                             │  Cart Service    │
│  (Port 8083)     │                             │  (Port 8084)     │
│                  │                             │                  │
│ CRUD Operations  │                             │ Event Producer   │
│ No Events        │                             │ (AddedToCart)    │
│                  │                             │ (RemovedFromCart)│
│ PostgreSQL       │                             │ PostgreSQL       │
│ (products_db)    │                             │ (cart_db)        │
└──────────────────┘                             └────────┬─────────┘
                                                           │
                            ┌──────────────────────────────┘
                            │
                            │ AddedToCartEvent
                            │ RemovedFromCartEvent
                            │
                            ▼
┌────────────────────────────────────────┐
│    Inventory Service (Port 8085)       │
│                                        │
│    Event Consumer & Producer           │
│    - Listens: AddedToCartEvent         │
│    - Listens: RemovedFromCartEvent     │
│    - Publishes: InventoryReservedEvent │
│                                        │
│    PostgreSQL (inventory_db)           │
└────────────────────────────────────────┘

                ▼
        ┌──────────────┐
        │    Kafka     │
        │   (Topics)   │
        │              │
        │ cart-events  │
        │ inventory-   │
        │  events      │
        └──────────────┘
```

## Event Flow: Adding an Item to Cart

### Step 1: User Adds Product to Cart
```
POST /api/v1/carts/{userId}/items
{
  "productId": 1,
  "quantity": 2,
  "price": 49.99
}
```

**Cart Service Response:**
- Creates/updates cart item
- Publishes `AddedToCartEvent` to `cart-events` topic
- Returns cart with item

### Step 2: Inventory Service Consumes AddedToCartEvent
```
AddedToCartEvent:
{
  "cartId": 123,
  "userId": "user-456",
  "productId": 1,
  "quantity": 2,
  "price": 49.99,
  "timestamp": "2024-07-28T10:30:00"
}
```

**Inventory Service Logic:**
1. Receives event from Kafka
2. Checks available stock for product_id=1
3. If stock available:
   - Reduces available_stock
   - Increases reserved_stock
   - Creates Reservation record
   - Publishes `InventoryReservedEvent` with success=true
4. If stock insufficient:
   - Publishes `InventoryReservedEvent` with success=false
   - Reason: "Insufficient stock. Available: X"

### Step 3: Inventory Service Publishes InventoryReservedEvent
```
InventoryReservedEvent:
{
  "reservationId": 789,
  "productId": 1,
  "userId": "user-456",
  "quantity": 2,
  "success": true,
  "reason": null,
  "timestamp": "2024-07-28T10:30:01"
}
```

This event is published to `inventory-events` topic and can be consumed by Cart Service for confirmation (optional).

## Services Detailed Breakdown

### 1. Products Service (Port 8083)

**Purpose:** Simple CRUD operations for product catalog

**Endpoints:**
- `GET /api/v1/products` - List all products
- `GET /api/v1/products/{id}` - Get product details
- `POST /api/v1/products` - Create new product
- `PUT /api/v1/products/{id}` - Update product
- `DELETE /api/v1/products/{id}` - Delete product

**Database:** `products_db` (PostgreSQL)

**Key Entities:**
- `Product`: id, name, description, price, stock, created_at, updated_at

**No Event Publishing:** This service is purely synchronous CRUD

---

### 2. Cart Service (Port 8084)

**Purpose:** Manage shopping carts and publish events for inventory management

**Endpoints:**
- `GET /api/v1/carts/{userId}` - Get user's cart
- `POST /api/v1/carts/{userId}/items` - Add item to cart
- `PUT /api/v1/carts/{cartId}/items/{itemId}` - Update item quantity
- `DELETE /api/v1/carts/{userId}/items/{itemId}` - Remove item from cart
- `POST /api/v1/carts/{userId}/checkout` - Initiate checkout

**Database:** `cart_db` (PostgreSQL)

**Key Entities:**
- `Cart`: id, user_id, created_at, updated_at
- `CartItem`: id, cart_id, product_id, quantity, price, added_at

**Events Published:**
- `AddedToCartEvent`: When item added to cart
- `RemovedFromCartEvent`: When item removed from cart
- `CheckoutInitiatedEvent`: When checkout is initiated

**Events Consumed:** (Optional)
- `InventoryReservedEvent`: Confirmation that inventory is reserved

---

### 3. Inventory Service (Port 8085)

**Purpose:** Manage stock levels and reservations based on cart events

**Endpoints:**
- `GET /api/v1/inventory/{productId}` - Check stock level
- `GET /api/v1/inventory/reserved/{userId}` - Get user's reserved items
- `PUT /api/v1/inventory/{productId}/reserve` - Manual stock reservation

**Database:** `inventory_db` (PostgreSQL)

**Key Entities:**
- `Inventory`: id, product_id, available_stock, reserved_stock, last_updated
- `Reservation`: id, product_id, user_id, quantity, reserved_at, expires_at, is_released

**Events Consumed:**
- `AddedToCartEvent`: From cart-events topic
- `RemovedFromCartEvent`: From cart-events topic

**Events Published:**
- `InventoryReservedEvent`: After attempting to reserve stock
- `InventoryReleaseEvent`: When reservation is released

---

## Kafka Topics

### Topic: `cart-events`
- **Partition Strategy:** By productId
- **Retention:** 7 days
- **Messages:**
  - `AddedToCartEvent`
  - `RemovedFromCartEvent`
  - `CheckoutInitiatedEvent`

### Topic: `inventory-events`
- **Partition Strategy:** By productId
- **Retention:** 7 days
- **Messages:**
  - `InventoryReservedEvent`
  - `InventoryReleaseEvent`

---

## Transactional Guarantees

### Cart Service
- **AddItemToCart:** Atomic transaction
  1. Save CartItem to DB
  2. Publish AddedToCartEvent (via StreamBridge, best-effort)
  3. Return cart response

### Inventory Service
- **HandleAddedToCartEvent:** Atomic transaction
  1. Lock Inventory record
  2. Check available_stock >= requested
  3. Update available_stock and reserved_stock
  4. Create Reservation record
  5. Publish InventoryReservedEvent (via StreamBridge, best-effort)

---

## Deployment & Configuration

### Environment Variables
```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres

# Kafka Configuration
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
```

### Docker Compose
All services can be started via:
```bash
docker-compose up -d
```

This starts:
- PostgreSQL (3 databases: products_db, cart_db, inventory_db)
- Kafka & Zookeeper
- Redis (for gateway)
- All microservices

---

## Eventual Consistency Model

This architecture implements **eventual consistency** via events:

1. **Cart Service** writes to cart_db immediately (strong consistency within its domain)
2. **Event is published** to Kafka
3. **Inventory Service** consumes event asynchronously and updates inventory_db
4. **Brief window of inconsistency:** Between cart write and inventory update

**This is acceptable for e-commerce because:**
- Stock reservations are time-limited (30 min expiry)
- Over-selling is prevented by inventory checks
- Customers see real-time availability on product page (direct query to inventory)

---

## Key Learnings: Event-Driven vs Synchronous

### Why Not Direct REST Calls?
- Decouples services: Cart doesn't need to know Inventory URL
- Resilient: If Inventory is down, Cart still works (event queued)
- Scalable: Multiple inventory instances can consume same event

### When to Use Events
- ✅ Cross-service notifications (Cart → Inventory)
- ✅ Asynchronous work (send confirmation emails)
- ❌ Strong consistency requirements (use saga pattern instead)
- ❌ Request-response needed immediately (use REST)

---

## Future Enhancements

1. **Dead Letter Queue (DLQ):** Handle poison messages
2. **Saga Pattern:** Implement distributed transactions for checkout
3. **Event Sourcing:** Store all state changes as events
4. **CQRS:** Separate read and write models for scaling
5. **Circuit Breaker:** Prevent cascading failures
6. **Observability:** Add tracing (Jaeger) and metrics (Prometheus)

---

## Testing the Flow End-to-End

### 1. Add a Product
```bash
curl -X POST http://localhost:8083/api/v1/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Laptop",
    "description": "High performance laptop",
    "price": 999.99,
    "stock": 5
  }'
```

### 2. Check Inventory
```bash
curl http://localhost:8085/api/v1/inventory/1
```

### 3. Add to Cart
```bash
curl -X POST http://localhost:8084/api/v1/carts/user-123/items \
  -H "Content-Type: application/json" \
  -d '{
    "productId": 1,
    "quantity": 1,
    "price": 999.99
  }'
```

### 4. Check Reserved Items
```bash
curl http://localhost:8085/api/v1/inventory/reserved/user-123
```

---

## Monitoring & Debugging

### View Kafka Topics
```bash
docker exec ecom_kafka kafka-topics --list --bootstrap-server localhost:9092
```

### Consume Messages from Topic
```bash
docker exec ecom_kafka kafka-console-consumer \
  --topic cart-events \
  --from-beginning \
  --bootstrap-server localhost:9092
```

### Database Queries
```bash
# Connect to products_db
psql -h localhost -U postgres -d products_db

# Connect to cart_db
psql -h localhost -U postgres -d cart_db -p 5433

# Connect to inventory_db
psql -h localhost -U postgres -d inventory_db -p 5434
```

---

## Performance Considerations

1. **Kafka Partitioning:** Messages for same product go to same partition (order preserved)
2. **Database Indexing:** Indexes on foreign keys and frequent query columns
3. **Connection Pooling:** HikariCP configured in each service
4. **Caching:** Consider Redis for frequently-accessed products

---

## References

- [Spring Cloud Stream](https://spring.io/projects/spring-cloud-stream)
- [Apache Kafka Documentation](https://kafka.apache.org/documentation/)
- [Event-Driven Architecture Pattern](https://www.martinfowler.com/articles/201701-event-driven.html)
