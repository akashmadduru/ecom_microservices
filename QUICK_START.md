# Quick Start Guide

Get the event-driven microservices up and running in minutes.

## Prerequisites

- **Docker & Docker Compose** (easiest path)
- OR:
  - Java 25+
  - Maven 3.9+
  - PostgreSQL 15+
  - Kafka/Zookeeper

## Option 1: Run Everything with Docker Compose (Recommended)

### Start All Services
```bash
cd /Users/akash/Desktop/projects/ecom_microservices

# Start all infrastructure + services
docker-compose up -d

# Wait ~30 seconds for all services to be healthy
docker-compose ps
```

### Check Status
```bash
# All should be "healthy"
docker ps --filter "label=com.docker.compose.project=ecom_microservices"
```

### View Logs
```bash
# View all logs
docker-compose logs -f

# View specific service
docker-compose logs -f products-service
docker-compose logs -f cart-service
docker-compose logs -f inventory-service
```

## Option 2: Run Services Locally (Development)

### Start Infrastructure Only
```bash
docker-compose up -d products-db cart-db inventory-db kafka zookeeper redis
```

### Build All Services
```bash
cd spring/

# Build parent and all modules
mvn clean package -DskipTests
```

### Run Each Service (in separate terminals)

**Products Service:**
```bash
cd spring/products/
mvn spring-boot:run
```

**Cart Service:**
```bash
cd spring/cart/
mvn spring-boot:run
```

**Inventory Service:**
```bash
cd spring/inventory/
mvn spring-boot:run
```

**Gateway:**
```bash
cd spring/gateway/
mvn spring-boot:run
```

---

## Test the Full Event Flow

### Step 1: Create a Product
```bash
curl -X POST http://localhost:8083/api/v1/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Laptop",
    "description": "High-performance laptop",
    "price": 999.99,
    "stock": 5
  }'
```

**Response:**
```json
{
  "id": 1,
  "name": "Laptop",
  "description": "High-performance laptop",
  "price": 999.99,
  "stock": 5,
  "createdAt": "2024-07-28T12:00:00",
  "updatedAt": "2024-07-28T12:00:00"
}
```

### Step 2: Initialize Inventory
```bash
# Connect to inventory database
psql -h localhost -p 5434 -U postgres -d inventory_db

# Insert initial stock
INSERT INTO inventory (product_id, available_stock, reserved_stock)
VALUES (1, 5, 0);

\q
```

Or via SQL script:
```bash
psql -h localhost -p 5434 -U postgres -d inventory_db \
  -c "INSERT INTO inventory (product_id, available_stock, reserved_stock) VALUES (1, 5, 0);"
```

### Step 3: Check Inventory
```bash
curl http://localhost:8085/api/v1/inventory/1
```

**Response:**
```json
{
  "id": 1,
  "productId": 1,
  "availableStock": 5,
  "reservedStock": 0,
  "lastUpdated": "2024-07-28T12:00:00"
}
```

### Step 4: Add Product to Cart
```bash
curl -X POST http://localhost:8084/api/v1/carts/user-123/items \
  -H "Content-Type: application/json" \
  -d '{
    "productId": 1,
    "quantity": 2,
    "price": 999.99
  }'
```

**This triggers:**
1. Cart Service saves the item
2. Publishes `AddedToCartEvent` to Kafka `cart-events` topic
3. Inventory Service consumes the event
4. Inventory Service reserves stock and publishes `InventoryReservedEvent`

**Response:**
```json
{
  "id": 1,
  "userId": "user-123",
  "items": [
    {
      "id": 1,
      "productId": 1,
      "quantity": 2,
      "price": 999.99,
      "addedAt": "2024-07-28T12:05:00"
    }
  ],
  "createdAt": "2024-07-28T12:00:00",
  "updatedAt": "2024-07-28T12:05:00"
}
```

### Step 5: Verify Stock Was Reserved
```bash
curl http://localhost:8085/api/v1/inventory/1
```

**Response (stock should be reserved):**
```json
{
  "id": 1,
  "productId": 1,
  "availableStock": 3,
  "reservedStock": 2,
  "lastUpdated": "2024-07-28T12:05:01"
}
```

### Step 6: Check Reserved Items for User
```bash
curl http://localhost:8085/api/v1/inventory/reserved/user-123
```

**Response:**
```json
[
  {
    "id": 1,
    "productId": 1,
    "userId": "user-123",
    "quantity": 2,
    "reservedAt": "2024-07-28T12:05:00",
    "expiresAt": "2024-07-28T12:35:00",
    "isReleased": false
  }
]
```

### Step 7: Remove Item from Cart
```bash
# First, get the cart to find item ID
curl http://localhost:8084/api/v1/carts/user-123

# Then delete the item (assuming item ID is 1)
curl -X DELETE http://localhost:8084/api/v1/carts/user-123/items/1
```

**This triggers:**
1. Cart Service removes the item
2. Publishes `RemovedFromCartEvent` to Kafka
3. Inventory Service releases the reservation

**Response:**
```json
{
  "id": 1,
  "userId": "user-123",
  "items": [],
  "createdAt": "2024-07-28T12:00:00",
  "updatedAt": "2024-07-28T12:10:00"
}
```

### Step 8: Verify Stock Was Released
```bash
curl http://localhost:8085/api/v1/inventory/1
```

**Response (stock should be available again):**
```json
{
  "id": 1,
  "productId": 1,
  "availableStock": 5,
  "reservedStock": 0,
  "lastUpdated": "2024-07-28T12:10:01"
}
```

---

## View Kafka Events (Optional)

### Watch Cart Events
```bash
docker exec ecom_kafka kafka-console-consumer \
  --topic cart-events \
  --from-beginning \
  --bootstrap-server localhost:9092 \
  --property print.key=true \
  --property key.separator=" | "
```

### Watch Inventory Events
```bash
docker exec ecom_kafka kafka-console-consumer \
  --topic inventory-events \
  --from-beginning \
  --bootstrap-server localhost:9092 \
  --property print.key=true \
  --property key.separator=" | "
```

---

## Useful Commands

### Stop Everything
```bash
docker-compose down
```

### Stop Specific Service
```bash
docker-compose stop products-service
```

### View Service Logs
```bash
docker-compose logs products-service -f
```

### Connect to Databases

**Products DB:**
```bash
psql -h localhost -p 5432 -U postgres -d products_db
```

**Cart DB:**
```bash
psql -h localhost -p 5433 -U postgres -d cart_db
```

**Inventory DB:**
```bash
psql -h localhost -p 5434 -U postgres -d inventory_db
```

### Check Health Endpoints
```bash
curl http://localhost:8083/actuator/health  # Products
curl http://localhost:8084/actuator/health  # Cart
curl http://localhost:8085/actuator/health  # Inventory
curl http://localhost:8080/actuator/health  # Gateway
```

---

## Service Endpoints

| Service | Port | Base URL |
|---------|------|----------|
| Products | 8083 | http://localhost:8083/api/v1/products |
| Cart | 8084 | http://localhost:8084/api/v1/carts |
| Inventory | 8085 | http://localhost:8085/api/v1/inventory |
| Gateway | 8080 | http://localhost:8080 |

---

## Troubleshooting

### Services Won't Start
```bash
# Check logs
docker-compose logs

# Ensure ports are not in use
lsof -i :8083 -i :8084 -i :8085 -i :5432 -i :5433 -i :5434

# Clean and restart
docker-compose down -v
docker-compose up -d
```

### Kafka Messages Not Appearing
```bash
# Check if Kafka is healthy
docker exec ecom_kafka kafka-topics --list --bootstrap-server localhost:9092

# Check consumer groups
docker exec ecom_kafka kafka-consumer-groups \
  --list --bootstrap-server localhost:9092
```

### Database Connection Issues
```bash
# Test connection to products_db
psql -h localhost -p 5432 -U postgres -d products_db -c "SELECT 1;"

# Check logs for migration issues
docker-compose logs products-db
```

### "Already in use" Error
```bash
# Kill process on port (example: port 8083)
lsof -i :8083
kill -9 <PID>

# Or change ports in docker-compose.yml
```

---

## Project Structure

```
ecom_microservices/
├── spring/
│   ├── pom.xml                    # Parent POM
│   ├── products/                  # Products Service
│   ├── cart/                      # Cart Service
│   ├── inventory/                 # Inventory Service
│   └── gateway/                   # API Gateway
├── docker-compose.yml             # Infrastructure setup
├── EVENT_DRIVEN_ARCHITECTURE.md   # Architecture guide
└── QUICK_START.md                 # This file
```

---

## Next Steps

1. **Read the Architecture Guide:** See `EVENT_DRIVEN_ARCHITECTURE.md` for detailed event flow
2. **Explore Service READMEs:** Check each service's README for detailed API docs
3. **Play with Events:** Use Kafka console consumers to watch events in real-time
4. **Modify Services:** Update business logic and watch events ripple through system
5. **Write Tests:** Add test cases to validate event processing

---

## Key Concepts Demonstrated

✅ **Event-Driven Architecture:** Services communicate via Kafka events  
✅ **Asynchronous Processing:** Events processed independently by consumers  
✅ **Database per Service:** Each service owns its database  
✅ **Eventual Consistency:** Stock levels updated after event processing  
✅ **Loose Coupling:** Services don't know about each other  
✅ **Scalability:** Easy to add more instances of any service  

---

## Common Patterns Used

### Transactional Outbox Pattern (Future)
Currently events are published best-effort. For guaranteed delivery, implement outbox table.

### Saga Pattern (Future)
For distributed transactions (checkout → payment → order), implement saga pattern.

### CQRS (Future)
Separate read and write models for inventory service scaling.

---

## Performance Tips

1. **Use Pagination:** `GET /api/v1/products/page?page=0&size=20`
2. **Batch Operations:** Add multiple items in one request
3. **Connection Pooling:** HikariCP (10 connections per service)
4. **Indexing:** Check database indexes on frequently queried columns
5. **Caching:** Consider caching product catalog in gateway

---

## Learning Resources

- **Spring Boot:** https://spring.io/projects/spring-boot
- **Spring Cloud Stream:** https://spring.io/projects/spring-cloud-stream
- **Apache Kafka:** https://kafka.apache.org/
- **Event-Driven Architecture:** https://martinfowler.com/articles/201701-event-driven.html
- **Eventual Consistency:** https://www.allthingsdistributed.com/2008/12/eventually_consistent.html

---

## Questions?

Check the README in each service directory for detailed documentation.
