# Cart Service

A Spring Boot microservice for managing shopping carts and publishing events for inventory coordination.

## Overview

- **Port:** 8084
- **Database:** PostgreSQL (`cart_db`)
- **Events Published:** AddedToCartEvent, RemovedFromCartEvent, CheckoutInitiatedEvent
- **Events Consumed:** InventoryReservedEvent (optional)
- **Framework:** Spring Boot 4.1.0, Spring Cloud Stream + Kafka

## API Endpoints

### Get or Create User Cart
```bash
GET /api/v1/carts/{userId}
```

Response:
```json
{
  "id": 1,
  "userId": "user-123",
  "items": [
    {
      "id": 10,
      "productId": 1,
      "quantity": 2,
      "price": 49.99,
      "addedAt": "2024-07-28T10:30:00"
    }
  ],
  "createdAt": "2024-07-28T10:00:00",
  "updatedAt": "2024-07-28T10:30:00"
}
```

### Add Item to Cart
```bash
POST /api/v1/carts/{userId}/items
Content-Type: application/json

{
  "productId": 1,
  "quantity": 2,
  "price": 49.99
}
```

**Side Effects:**
- Publishes `AddedToCartEvent` to Kafka topic `cart-events`
- Inventory service listens and reserves stock

Response: `201 Created` with updated cart

### Update Cart Item Quantity
```bash
PUT /api/v1/carts/{cartId}/items/{itemId}?quantity=5
```

Response: `200 OK` with updated cart

### Remove Item from Cart
```bash
DELETE /api/v1/carts/{userId}/items/{itemId}
```

**Side Effects:**
- Publishes `RemovedFromCartEvent` to Kafka topic `cart-events`
- Inventory service listens and releases reserved stock

Response: `200 OK` with updated cart

### Checkout
```bash
POST /api/v1/carts/{userId}/checkout
```

**Side Effects:**
- Publishes `CheckoutInitiatedEvent` to Kafka topic `cart-events`
- Can trigger order processing in downstream services

Response:
```json
{
  "id": 1,
  "userId": "user-123",
  "items": [...],
  "totalAmount": 99.98,
  "createdAt": "2024-07-28T10:00:00",
  "updatedAt": "2024-07-28T10:35:00"
}
```

## Running Locally

### Prerequisites
- Java 25+
- Maven 3.9+
- PostgreSQL 15+
- Kafka running on `localhost:9092`

### Setup Database
```bash
createdb cart_db
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
cd spring/cart

mvn clean package

mvn spring-boot:run
```

### Using Docker Compose
```bash
# From project root
docker-compose up cart-db kafka

# Wait for services, then run locally
mvn spring-boot:run
```

## Project Structure

```
src/main/java/com/ecom/cart/
├── entity/
│   ├── Cart.java             # Shopping cart entity
│   └── CartItem.java         # Individual cart item
├── repository/
│   ├── CartRepository.java   # Cart data access
│   └── CartItemRepository.java
├── service/
│   └── CartService.java      # Business logic + event publishing
├── controller/
│   └── CartController.java   # REST endpoints
├── dto/
│   ├── CartResponse.java
│   ├── CartItemRequest.java
│   └── CartItemResponse.java
├── event/
│   ├── AddedToCartEvent.java
│   ├── RemovedFromCartEvent.java
│   ├── CheckoutInitiatedEvent.java
│   └── InventoryReservedEvent.java (consumed)
├── exception/
│   ├── CartNotFoundException.java
│   ├── InvalidCartItemException.java
│   └── GlobalExceptionHandler.java
└── CartApplication.java
```

## Database Schema

```sql
CREATE TABLE carts (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE cart_items (
    id BIGSERIAL PRIMARY KEY,
    cart_id BIGINT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    price NUMERIC(10, 2) NOT NULL,
    added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_carts_user_id ON carts(user_id);
CREATE INDEX idx_cart_items_cart_id ON cart_items(cart_id);
CREATE INDEX idx_cart_items_product_id ON cart_items(product_id);
```

## Event Flow Example

### Adding Item to Cart
```
1. POST /api/v1/carts/user-123/items
   ├─ CartService.addItemToCart()
   ├─ Save CartItem to cart_db
   ├─ Publish AddedToCartEvent to Kafka
   └─ Return cart response (201)

2. Inventory Service consumes AddedToCartEvent
   ├─ Check stock availability
   ├─ Reserve stock
   └─ Publish InventoryReservedEvent

3. (Optional) Cart Service consumes InventoryReservedEvent
   ├─ Confirm reservation success
   └─ Update cart status
```

## Event Schema

### AddedToCartEvent
```json
{
  "cartId": 1,
  "userId": "user-123",
  "productId": 1,
  "quantity": 2,
  "price": 49.99,
  "timestamp": "2024-07-28T10:30:00"
}
```

### RemovedFromCartEvent
```json
{
  "cartId": 1,
  "userId": "user-123",
  "productId": 1,
  "quantity": 2,
  "timestamp": "2024-07-28T10:35:00"
}
```

### CheckoutInitiatedEvent
```json
{
  "cartId": 1,
  "userId": "user-123",
  "totalAmount": 99.98,
  "timestamp": "2024-07-28T10:36:00"
}
```

## Transactional Boundaries

- **Scope:** Service layer using `@Transactional`
- **Unit of Work:** One logical cart operation (add/remove/checkout)
- **Isolation:** DEFAULT (READ_COMMITTED)
- **Event Publishing:** Best-effort via `StreamBridge` (not part of transaction)

### Important:
Event publishing is NOT transactional. If event publish fails after DB commit, the event is lost. For production, implement **Transactional Outbox pattern**.

## Error Handling

| Status | Exception | Cause |
|--------|-----------|-------|
| 404 | CartNotFoundException | Cart/item not found |
| 400 | InvalidCartItemException | Empty cart checkout, negative quantity |
| 500 | Generic Exception | Database/Kafka error |

## Testing

### Unit Tests
```bash
mvn test -Dtest=CartServiceTest
```

### Integration Tests (with Testcontainers)
```bash
mvn test -Dtest=*IntegrationTest
```

## Monitoring

### Health Check
```bash
curl http://localhost:8084/actuator/health
```

### View Kafka Messages
```bash
# Watch cart-events topic
docker exec ecom_kafka kafka-console-consumer \
  --topic cart-events \
  --from-beginning \
  --bootstrap-server localhost:9092
```

## Performance Considerations

1. **N+1 Prevention:** Use FetchType.LAZY with explicit @EntityGraph if needed
2. **Cart Cleanup:** Implement periodic cleanup of old carts (e.g., >30 days)
3. **Indexes:** Keep user_id indexed for fast cart lookup
4. **Event Batching:** Consider batching multiple item additions

## Known Limitations

1. **Idempotency:** AddedToCartEvent is not idempotent; re-processing increases quantity
2. **Distributed Transactions:** No saga pattern yet (next phase)
3. **Event Ordering:** Assumes Kafka partitioning by userId for consistency
4. **Timeout Handling:** Inventory reservations expire after 30 min; no automatic cart cleanup

## Next Steps

- Implement Event Sourcing for complete audit trail
- Add Saga orchestration for checkout → payment → order flow
- Integrate with Order Service
- Add async notification when inventory reserved
