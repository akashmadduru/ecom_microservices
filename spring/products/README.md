# Products Service

A Spring Boot microservice for managing product catalog with CRUD operations.

## Overview

- **Port:** 8083
- **Database:** PostgreSQL (`products_db`)
- **Events:** None (pure CRUD)
- **Framework:** Spring Boot 4.1.0, Spring Data JPA

## API Endpoints

### List all products
```bash
GET /api/v1/products
```

Response:
```json
[
  {
    "id": 1,
    "name": "Laptop",
    "description": "High performance laptop",
    "price": 999.99,
    "stock": 5,
    "createdAt": "2024-07-28T10:00:00",
    "updatedAt": "2024-07-28T10:00:00"
  }
]
```

### Get product by ID
```bash
GET /api/v1/products/{id}
```

### Create product
```bash
POST /api/v1/products
Content-Type: application/json

{
  "name": "Laptop",
  "description": "High performance laptop",
  "price": 999.99,
  "stock": 5
}
```

Response: `201 Created`

### Update product
```bash
PUT /api/v1/products/{id}
Content-Type: application/json

{
  "name": "Updated Laptop",
  "description": "Updated description",
  "price": 1099.99,
  "stock": 10
}
```

Response: `200 OK`

### Delete product
```bash
DELETE /api/v1/products/{id}
```

Response: `204 No Content`

### Paginated products
```bash
GET /api/v1/products/page?page=0&size=20
```

## Running Locally

### Prerequisites
- Java 25+
- Maven 3.9+
- PostgreSQL 15+

### Setup Database
```bash
# Create database
createdb products_db

# The service will run Flyway migrations automatically on startup
```

### Environment Variables
```bash
export DB_HOST=localhost
export DB_PORT=5432
export DB_USER=postgres
export DB_PASSWORD=postgres
```

### Build & Run
```bash
cd spring/products

# Build
mvn clean package

# Run
mvn spring-boot:run
```

### Using Docker Compose
```bash
# From project root
docker-compose up products-db

# Wait for database to be healthy, then run locally
mvn spring-boot:run
```

## Project Structure

```
src/main/java/com/ecom/products/
├── entity/
│   └── Product.java          # JPA Entity
├── repository/
│   └── ProductRepository.java # Data access layer
├── service/
│   └── ProductService.java   # Business logic
├── controller/
│   └── ProductController.java # REST endpoints
├── dto/
│   ├── ProductRequest.java   # Input DTO
│   └── ProductResponse.java  # Output DTO
├── exception/
│   ├── ProductNotFoundException.java
│   ├── InvalidProductException.java
│   └── GlobalExceptionHandler.java
└── ProductsApplication.java  # Main class
```

## Database Schema

```sql
CREATE TABLE products (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price NUMERIC(10, 2) NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_products_name ON products(name);
```

## Transactional Boundaries

- **Service layer:** All operations wrapped in `@Transactional`
- **Isolation:** DEFAULT (typically READ_COMMITTED)
- **Propagation:** REQUIRED

## Error Handling

| Status | Exception | Cause |
|--------|-----------|-------|
| 404 | ProductNotFoundException | Product ID not found |
| 400 | InvalidProductException | Invalid input (price ≤ 0, missing name, etc.) |
| 500 | Generic Exception | Unexpected database error |

## Testing

### Run Tests
```bash
mvn test
```

### Test Coverage
- Controller tests using MockMvc
- Service unit tests with Mockito
- Integration tests with TestContainers (optional)

## Monitoring

### Health Check
```bash
curl http://localhost:8083/actuator/health
```

### Available Endpoints
```bash
curl http://localhost:8083/actuator/info
```

## Performance Tips

1. **Indexing:** `idx_products_name` for frequent lookups
2. **Pagination:** Use `GET /api/v1/products/page` for large result sets
3. **Connection Pool:** HikariCP with default settings (10 connections)

## Notes

- This service has no event publishing/consuming
- It's read-heavy; consider caching product catalog in gateway/client
- Stock levels are managed by Inventory service (separate DB)
