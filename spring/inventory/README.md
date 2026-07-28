# Inventory Service

A Spring Boot microservice for managing product inventory and stock reservations through event-driven architecture.

## Overview

- **Port:** 8085
- **Database:** PostgreSQL (`inventory_db`)
- **Events Consumed:** AddedToCartEvent, RemovedFromCartEvent
- **Events Published:** InventoryReservedEvent, InventoryReleaseEvent
- **Framework:** Spring Boot 4.1.0, Spring Cloud Stream + Kafka

## Architecture

```
Cart Service                 Inventory Service
   (Port 8084)                  (Port 8085)
       │
       ├─► AddedToCartEvent ──►  [CartEventListener]
       │                              │
       │                              ├─► Check Stock
       │                              ├─► Reserve Stock
       │                              └─► Publish InventoryReservedEvent
       │
       └─► RemovedFromCartEvent ─►  [CartEventListener]
                                        │
                                        ├─► Release Reservation
                                        └─► Publish InventoryReleaseEvent
```

## API Endpoints

### Check Product Inventory
```bash
GET /api/v1/inventory/{productId}
```

Response:
```json
{
  "id": 1,
  "productId": 1,
  "availableStock": 3,
  "reservedStock": 2,
  "lastUpdated": "2024-07-28T10:35:00"
}
```

**Fields:**
- `availableStock`: Units available for sale
- `reservedStock`: Units reserved by carts (not yet paid)
- Total stock = availableStock + reservedStock

### Get User's Reserved Items
```bash
GET /api/v1/inventory/reserved/{userId}
```

Response:
```json
[
  {
    "id": 10,
    "productId": 1,
    "userId": "user-123",
    "quantity": 2,
    "reservedAt": "2024-07-28T10:30:00",
    "expiresAt": "2024-07-28T11:00:00",
    "isReleased": false
  }
]
```

### Manual Stock Reservation (Admin)
```bash
PUT /api/v1/inventory/{productId}/reserve?userId=user-123&quantity=5
```

Response: `200 OK`

## Running Locally

### Prerequisites
- Java 25+
- Maven 3.9+
- PostgreSQL 15+
- Kafka running on `localhost:9092`

### Setup Database
```bash
createdb inventory_db
```

### Environment Variables
```bash
export DB_HOST=localhost
export DB_PORT=5432
export DB_USER=postgres
export DB_PASSWORD=postgres
export KAFKA_BOOTSTRAP_SERVERS=localhost:9092
```

### Build & Run
```bash
cd spring/inventory

mvn clean package

mvn spring-boot:run
```

### Using Docker Compose
```bash
# From project root
docker-compose up inventory-db kafka

# Wait for services, then run locally
mvn spring-boot:run
```

## Project Structure

```
src/main/java/com/ecom/inventory/
├── entity/
│   ├── Inventory.java        # Stock levels per product
│   └── Reservation.java      # Stock reservations from carts
├── repository/
│   ├── InventoryRepository.java
│   └── ReservationRepository.java
├── service/
│   └── InventoryService.java # Business logic + event handlers
├── listener/
│   └── CartEventListener.java # Kafka consumer for cart events
├── controller/
│   └── InventoryController.java # REST endpoints
├── dto/
│   ├── InventoryResponse.java
│   └── ReservationResponse.java
├── event/
│   ├── AddedToCartEvent.java (consumed)
│   ├── RemovedFromCartEvent.java (consumed)
│   ├── InventoryReservedEvent.java (published)
│   └── InventoryReleaseEvent.java (published)
├── exception/
│   ├── OutOfStockException.java
│   ├── InventoryNotFoundException.java
│   └── GlobalExceptionHandler.java
└── InventoryApplication.java
```

## Database Schema

```sql
-- Inventory levels per product
CREATE TABLE inventory (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL UNIQUE,
    available_stock INTEGER NOT NULL DEFAULT 0,
    reserved_stock INTEGER NOT NULL DEFAULT 0,
    last_updated TIMESTAMP
);

-- Reservations made by carts
CREATE TABLE reservations (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL,
    reserved_at TIMESTAMP NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    is_released BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_inventory_product_id ON inventory(product_id);
CREATE INDEX idx_reservations_product_id ON reservations(product_id);
CREATE INDEX idx_reservations_user_id ON reservations(user_id);
CREATE INDEX idx_reservations_is_released ON reservations(is_released);
```

## Event Processing

### Consuming AddedToCartEvent

**Flow:**
```
1. CartEventListener receives AddedToCartEvent
2. InventoryService.handleAddedToCartEvent()
3. Query Inventory by productId
4. IF availableStock >= requestedQuantity:
   ├─ Decrement availableStock
   ├─ Increment reservedStock
   ├─ Create Reservation record
   └─ Publish InventoryReservedEvent (success=true)
   ELSE:
   └─ Publish InventoryReservedEvent (success=false, reason=...)
```

**Example Event:**
```json
{
  "cartId": 123,
  "userId": "user-456",
  "productId": 1,
  "quantity": 2,
  "price": 49.99,
  "timestamp": "2024-07-28T10:30:00"
}
```

**Published Response:**
```json
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

### Consuming RemovedFromCartEvent

**Flow:**
```
1. CartEventListener receives RemovedFromCartEvent
2. InventoryService.handleRemovedFromCartEvent()
3. Query active Reservations for user + product
4. Release the reservation:
   ├─ Increment availableStock
   ├─ Decrement reservedStock
   ├─ Mark Reservation.isReleased = true
   └─ Publish InventoryReleaseEvent
```

## Event Schema

### InventoryReservedEvent (Published)
```json
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

### InventoryReleaseEvent (Published)
```json
{
  "reservationId": 789,
  "productId": 1,
  "quantity": 2,
  "timestamp": "2024-07-28T10:35:01"
}
```

## Transactional Guarantees

### Stock Reservation Transaction
```java
@Transactional
public void handleAddedToCartEvent(AddedToCartEvent event) {
    // 1. SELECT Inventory WHERE productId = ? FOR UPDATE
    // 2. Check availableStock
    // 3. UPDATE Inventory (decrement available, increment reserved)
    // 4. INSERT Reservation
    // 5. Commit transaction
    // 6. Publish InventoryReservedEvent (best-effort, outside transaction)
}
```

**Isolation:** Prevents race conditions via row-level locks

### Known Issue:
Event publishing is **not transactional**. If service crashes after DB commit but before event publish, the event is lost. **Solution:** Implement Transactional Outbox pattern (future enhancement).

## Error Handling

| Status | Exception | Cause |
|--------|-----------|-------|
| 404 | InventoryNotFoundException | Product has no inventory record |
| 409 | OutOfStockException | Insufficient available stock |
| 500 | Generic Exception | Database error |

## Performance Considerations

### Indexing Strategy
- `idx_inventory_product_id`: Fast lookups by product
- `idx_reservations_is_released`: Query active reservations efficiently
- `idx_reservations_user_id`: Find user's reservations

### Connection Pooling
- HikariCP with 10 connections (default)
- Adjust via environment variable if needed

### Kafka Partitioning
- Topic `cart-events` partitioned by `productId`
- Ensures all events for same product go to same partition
- **Benefit:** Maintains ordering of reservations for each product

## Stock Reservation Expiry

**Default:** 30 minutes

```java
expiresAt = LocalDateTime.now().plusMinutes(30)
```

**Manual Cleanup (Future):**
```sql
DELETE FROM reservations 
WHERE is_released = false AND expires_at < NOW();
```

## Monitoring

### Health Check
```bash
curl http://localhost:8085/actuator/health
```

### View Kafka Messages
```bash
# Watch inventory-events
docker exec ecom_kafka kafka-console-consumer \
  --topic inventory-events \
  --from-beginning \
  --bootstrap-server localhost:9092
```

### Database Queries
```bash
# Connect to inventory_db
psql -h localhost -U postgres -d inventory_db -p 5434

# Check stock levels
SELECT * FROM inventory WHERE product_id = 1;

# Check active reservations
SELECT * FROM reservations WHERE is_released = false;

# Check user's reservations
SELECT * FROM reservations WHERE user_id = 'user-123' AND is_released = false;
```

## Testing

### Unit Tests
```bash
mvn test -Dtest=InventoryServiceTest
```

### Integration Tests
```bash
mvn test -Dtest=*IntegrationTest
```

## Known Limitations

1. **No Distributed Transactions:** No saga pattern for checkout flow
2. **Idempotency Issues:** Duplicate events increase reserved_stock twice
3. **Manual Cleanup:** Expired reservations must be cleaned periodically
4. **No Inventory Initialization:** Stock levels must be set via API before first sale

## Next Steps

1. **Implement Transactional Outbox:** Guarantee event publishing
2. **Add Reservation Expiry Job:** Background task to clean expired reservations
3. **Audit Trail:** Log all stock movements for compliance
4. **Metrics:** Track stock velocity, reservation rate, expiry rate
5. **Integration with Orders:** Finalize reservations when order is placed

## Testing the Flow

### 1. Initialize Inventory
```sql
-- Connect to inventory_db
INSERT INTO inventory (product_id, available_stock, reserved_stock)
VALUES (1, 10, 0);
```

### 2. Add Product to Cart
```bash
curl -X POST http://localhost:8084/api/v1/carts/user-123/items \
  -H "Content-Type: application/json" \
  -d '{
    "productId": 1,
    "quantity": 2,
    "price": 49.99
  }'
```

### 3. Check Inventory (Stock should be reserved)
```bash
curl http://localhost:8085/api/v1/inventory/1
# availableStock: 8, reservedStock: 2
```

### 4. Check Reservations
```bash
curl http://localhost:8085/api/v1/inventory/reserved/user-123
```

### 5. Remove Item from Cart
```bash
curl -X DELETE http://localhost:8084/api/v1/carts/user-123/items/1
```

### 6. Check Inventory (Reservation should be released)
```bash
curl http://localhost:8085/api/v1/inventory/1
# availableStock: 10, reservedStock: 0
```
