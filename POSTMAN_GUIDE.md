# Postman Collection Guide - Spring Boot Microservices

## Overview
This guide covers the updated Postman collection for testing the E-Commerce Spring Boot microservices architecture.

## Service Endpoints

### 1. Authentication Service (Port 8082)
Base URL: `http://localhost:8082/api/v1/auth`

#### Authentication Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/signup` | Register new user |
| POST | `/signin` | Login with username/password |
| POST | `/token/refresh` | Refresh JWT token |
| GET | `/validate` | Validate JWT token |
| GET | `/users/me` | Get current user info |
| POST | `/logout` | Logout current session |
| POST | `/logout/all` | Logout all sessions |

#### OAuth2 / SSO Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/sso/google/authorize` | Redirect to Google OAuth |
| GET | `/sso/google/callback?code=...&state=...` | Google callback handler |
| POST | `/sso/google` | Login with Google token |
| POST | `/sso/login` | Generic SSO login |

#### Internal Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/internal/users/{user_id}` | Get user by ID (service-to-service) |

---

### 2. Products Service (Port 8083)
Base URL: `http://localhost:8083/api/v1/products`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Get all products |
| GET | `/page?page=0&size=20` | Get products with pagination |
| GET | `/{id}` | Get product by ID |
| POST | `/` | Create product (requires auth) |
| PUT | `/{id}` | Update product (requires auth) |
| DELETE | `/{id}` | Delete product (requires auth) |

**Product ID Format**: Long (numeric)

---

### 3. Cart Service (Port 8084)
Base URL: `http://localhost:8084/api/v1/carts`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/{userId}` | Get user's cart |
| POST | `/{userId}/items` | Add item to cart |
| PUT | `/{cartId}/items/{itemId}?quantity=X` | Update item quantity |
| DELETE | `/{userId}/items/{itemId}` | Remove item from cart |
| POST | `/{userId}/checkout` | Checkout cart |

**ID Formats**:
- `userId`: String (user identifier)
- `cartId`, `itemId`: Long (numeric)

---

### 4. Inventory Service (Port 8085)
Base URL: `http://localhost:8085/api/v1/inventory`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/{productId}` | Get stock level |
| GET | `/reserved/{userId}` | Get user's reservations |
| PUT | `/{productId}/reserve?userId=...&quantity=...` | Manual reserve/release |

**ID Formats**:
- `productId`: Long (numeric)
- `userId`: String (user identifier)

---

## Usage Instructions

### 1. Import Collection
1. Open Postman
2. Click "Import" → Select `postman-collection.json`
3. Collection will appear in left sidebar

### 2. Set Variables
Before making requests, update these variables:
- `{{access_token}}` - Your JWT token from signin/signup
- `{{refresh_token}}` - Your refresh token
- `{{base_url}}` - Default: `http://localhost`

### 3. Quick Start Flow

**Step 1: Signup**
```
POST /api/v1/auth/signup
Body:
{
  "username": "testuser",
  "email": "test@example.com",
  "password": "TestPass123!",
  "role": "USER"
}
```

**Step 2: Signin**
```
POST /api/v1/auth/signin
Body:
{
  "username": "testuser",
  "password": "TestPass123!"
}
```
Response includes `access_token` and `refresh_token`

**Step 3: Use Access Token**
Copy the `access_token` from response and set it as:
```
Authorization: Bearer {{access_token}}
```

**Step 4: Browse Products**
```
GET /api/v1/products
```

**Step 5: Add to Cart**
```
POST /api/v1/carts/{userId}/items
Body:
{
  "product_id": 1,
  "quantity": 2,
  "price": 299.99
}
```

**Step 6: Checkout**
```
POST /api/v1/carts/{userId}/checkout
```

---

## Authentication

All protected endpoints require JWT Bearer token:
```
Authorization: Bearer <your-jwt-token>
```

### Token Refresh
When token expires, use refresh endpoint:
```
POST /api/v1/auth/token/refresh
Body:
{
  "refresh_token": "{{refresh_token}}"
}
```

---

## Data Types

### Important Notes
- **Product IDs**: Long (numeric) - Use `1`, `2`, etc.
- **User IDs**: String (UUID format) - e.g., `550e8400-e29b-41d4-a716-446655440000`
- **Cart IDs**: Long (numeric)
- **Prices**: Decimal - e.g., `299.99`

---

## Monitoring & Health Checks

Each service provides health and metrics endpoints:

**Health Check**
```
GET http://localhost:{PORT}/actuator/health
```

**Prometheus Metrics**
```
GET http://localhost:{PORT}/actuator/prometheus
```

### Feign Circuit Breaker Monitoring (Phase 1+)

Feign clients integrate with Resilience4j Circuit Breaker with the following configuration:
- **Failure Threshold**: 50% (circuit opens when 50% of calls fail)
- **Timeout**: 3000ms (3 seconds per Feign call)
- **Slow Call Threshold**: 2 seconds
- **Wait Duration in Open State**: 30 seconds

**Circuit Breaker Health Endpoint**
```
GET http://localhost:{PORT}/actuator/health/circuitbreakers
```

Response shows state (CLOSED, OPEN, HALF_OPEN) for each circuit:
- `products-service`: ProductsFeignClient health
- `inventory-service`: InventoryFeignClient health

**Circuit Breaker Details**
```
GET http://localhost:{PORT}/actuator/circuitbreakers
```

**Feign Client Configuration** (in application.yaml):
```yaml
feign:
  client:
    config:
      default:
        connectTimeout: 3000   # 3s timeout
        readTimeout: 3000      # 3s read timeout
        loggerLevel: BASIC
    circuitbreaker:
      enabled: true           # Enable Resilience4j integration
```

**Services with Feign Clients** (Phase 1):
- Cart Service (8084): Calls ProductsFeignClient, InventoryFeignClient
- Inventory Service (8085): Calls ProductsFeignClient

**Ports**:
- Auth Service: 8082
- Products Service: 8083
- Cart Service: 8084
- Inventory Service: 8085
- Eureka Server: 8761
- Prometheus: 9090
- Grafana: 3000

---

## Troubleshooting

### 401 Unauthorized
- Token may be expired → Use refresh endpoint
- Token format incorrect → Should be `Bearer <token>`
- Missing Authorization header

### 404 Not Found
- Resource doesn't exist
- Verify product/user ID is correct format
- Check service is running on expected port

### 500 Internal Server Error
- Check service logs
- Verify database connectivity
- Ensure all dependencies are running

### Token Refresh Fails
- Refresh token may be revoked
- Session may have expired (7 days default)
- Re-login required

---

## Environment Setup

### Start Infrastructure
```bash
docker-compose -f docker-compose.infra.yml up -d
```

### Start Services
```bash
# Terminal 1: Auth Service
cd spring/auth && mvn spring-boot:run

# Terminal 2: Products Service
cd spring/products && mvn spring-boot:run

# Terminal 3: Cart Service
cd spring/cart && mvn spring-boot:run

# Terminal 4: Inventory Service
cd spring/inventory && mvn spring-boot:run
```

### Access Dashboards
- Grafana: http://localhost:3000 (admin/admin)
- Prometheus: http://localhost:9090

---

## Collection Versions

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2025-07-29 | Updated for Spring Boot services, added SSO endpoints |
| 1.0 | 2024-12-01 | Initial collection |

---

## Contact & Support

For issues or updates to the collection, refer to the microservices documentation or GitHub repository.
