# Docker Setup for E-Commerce Microservices

This guide explains how to run the E-Commerce microservices using Docker Compose.

## Prerequisites

- Docker Desktop (Mac/Windows) or Docker Engine (Linux)
- Docker Compose 2.0+
- Java 17 (for local builds)
- Maven 3.9+

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    API Gateway (8080)                    │
│              (Spring Cloud Gateway)                      │
└──────┬──────────────────────────────────────────┬────────┘
       │                                          │
       ├──────────────────┬──────────────────┬────┴─────┐
       │                  │                  │          │
   ┌───▼───┐         ┌────▼──┐         ┌────▼──┐    ┌──▼──┐
   │ Auth  │         │Product│         │Inventory   │Cache│
   │ 8081  │         │ 8082  │         │ 8083      │Redis│
   └───┬───┘         └────┬──┘         └────┬──┘    └──┬──┘
       │                  │                  │         │
       └──────────────────┴──────────────────┴─────────┴──┐
                            │                            │
                     ┌──────▼──────┐            ┌────────▼────┐
                     │ PostgreSQL  │            │ Kafka/Zk   │
                     │  Database   │            │ EventBus   │
                     └─────────────┘            └────────────┘
```

## Services

| Service | Port | Database | Purpose |
|---------|------|----------|---------|
| **api-gateway** | 8080 | - | Route requests to services |
| **auth-service** | 8081 | ecommerce_auth | Authentication & JWT |
| **product-service** | 8082 | ecommerce_product | Product catalog |
| **inventory-service** | 8083 | ecommerce_inventory | Stock management |
| **PostgreSQL** | 5432 | - | Primary database |
| **Redis** | 6379 | - | Caching layer |
| **Kafka** | 9092 | - | Event streaming |
| **Zookeeper** | 2181 | - | Kafka coordination |

## Quick Start

### 1. Start All Services

```bash
# Using the provided script
./scripts/docker-start.sh

# Or using docker-compose directly
docker-compose up -d
```

### 2. Verify Services Are Running

```bash
./scripts/docker-status.sh
# or
docker-compose ps
```

### 3. View Logs

```bash
# All services
./scripts/docker-logs.sh

# Specific service
./scripts/docker-logs.sh product-service
```

### 4. Stop All Services

```bash
./scripts/docker-stop.sh
# or
docker-compose down -v  # -v removes volumes
```

## Service URLs (Internal - Docker Network)

- **API Gateway:** http://api-gateway:8080
- **Auth Service:** http://auth-service:8081
- **Product Service:** http://product-service:8082
- **Inventory Service:** http://inventory-service:8083

## Service URLs (External - Host Machine)

- **API Gateway:** http://localhost:8080
- **Auth Service:** http://localhost:8081
- **Product Service:** http://localhost:8082
- **Inventory Service:** http://localhost:8083
- **PostgreSQL:** localhost:5432
- **Redis:** localhost:6379
- **Kafka:** localhost:9092

## Configuration

### Environment Variables

Edit `.env.docker` to customize:

```bash
# Database
DB_USER=ecom_user
DB_PASSWORD=ecom_password

# Service Configuration
SPRING_PROFILES_ACTIVE=docker
JAVA_TOOL_OPTIONS=-Xmx768m

# Logging
LOGGING_LEVEL_COM_ECOM=INFO
LOGGING_LEVEL_ORG_SPRINGFRAMEWORK=WARN
```

### Service-Specific Configuration

Each service has application.properties in:
- `spring/services/auth-service/src/main/resources/application.properties`
- `spring/services/product-service/src/main/resources/application.properties`
- `spring/services/inventory-service/src/main/resources/application.properties`
- `spring/services/api-gateway/src/main/resources/application.properties`

## Health Checks

All services expose health endpoints:

```bash
curl http://localhost:8080/actuator/health
curl http://localhost:8081/actuator/health
curl http://localhost:8082/actuator/health
curl http://localhost:8083/actuator/health
```

## Database Management

### Access PostgreSQL

```bash
docker-compose exec postgres psql -U ecom_user -d ecommerce_product
```

### View Migrations

```bash
docker-compose exec postgres psql -U ecom_user -d ecommerce_product -c "\dt"
```

### Reset Database

```bash
docker-compose down -v  # Remove volumes
docker-compose up -d    # Start with fresh databases
```

## Kafka Management

### View Topics

```bash
docker-compose exec kafka kafka-topics --list --bootstrap-server kafka:29092
```

### Consume Messages

```bash
docker-compose exec kafka kafka-console-consumer \
  --bootstrap-server kafka:29092 \
  --topic product.events \
  --from-beginning
```

### Send Test Message

```bash
docker-compose exec kafka kafka-console-producer \
  --broker-list kafka:29092 \
  --topic test-topic
```

## Troubleshooting

### Service fails to start

```bash
# Check logs
docker-compose logs <service-name>

# Check resource constraints
docker stats

# Rebuild images
docker-compose build --no-cache
```

### Database connection error

```bash
# Ensure PostgreSQL is healthy
docker-compose logs postgres

# Restart PostgreSQL
docker-compose restart postgres
```

### Redis connection error

```bash
# Check Redis is running
docker-compose exec redis redis-cli ping

# Restart Redis
docker-compose restart redis
```

### Port already in use

```bash
# Find what's using port
lsof -i :8080

# Change port in docker-compose.yml
# Modify: ports: ["8090:8080"]
```

## Building Images

### Rebuild All Images

```bash
docker-compose build --no-cache
```

### Rebuild Specific Service

```bash
docker-compose build --no-cache product-service
```

### View Image Info

```bash
docker images | grep ecom
```

## Performance Tuning

### Memory Limits

Adjust JAVA_TOOL_OPTIONS in `.env.docker`:

```bash
# Current
JAVA_TOOL_OPTIONS=-Xmx768m

# For low-resource environments
JAVA_TOOL_OPTIONS=-Xmx512m

# For high-resource environments
JAVA_TOOL_OPTIONS=-Xmx2g
```

### Database Connection Pooling

Modify in application.properties:

```properties
spring.datasource.hikari.maximum-pool-size=20
spring.datasource.hikari.minimum-idle=5
```

### Cache Configuration

Redis TTL settings in application.properties:

```properties
spring.cache.redis.time-to-live=3600000  # 1 hour
```

## Monitoring

### Real-time Metrics

```bash
# CPU and Memory usage
docker stats

# Container events
docker-compose logs -f
```

### Service Metrics

Each service exposes Micrometer metrics:

```bash
curl http://localhost:8082/actuator/prometheus
```

## Network Configuration

All services communicate via `ecom-network` bridge network:

```bash
# View network
docker network inspect ecom_ecom-network

# Services can reach each other via service name
# e.g., http://product-service:8082
```

## Development Workflow

### Local Development

For local development without Docker:

```bash
cd spring
mvn clean install -DskipTests

# Start individual services
mvn -pl services/auth-service spring-boot:run
mvn -pl services/product-service spring-boot:run
mvn -pl services/inventory-service spring-boot:run
mvn -pl services/api-gateway spring-boot:run
```

### Testing

```bash
# Run all tests
docker-compose exec product-service mvn test

# Run specific test
docker-compose exec product-service mvn test -Dtest=ProductServiceTest
```

## Cleanup

### Remove All Containers and Volumes

```bash
docker-compose down -v
```

### Remove Dangling Images

```bash
docker image prune -f
```

### Full System Cleanup (Warning: Removes all Docker objects)

```bash
docker system prune -a --volumes
```

## Next Steps

1. Start services: `./scripts/docker-start.sh`
2. Access API Gateway: http://localhost:8080
3. Sign up/login via Auth Service endpoint
4. Explore Product Service catalog
5. Test Inventory Service stock operations

## References

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Spring Boot Docker Documentation](https://spring.io/guides/gs/spring-boot-docker/)
- [Kafka Docker Setup](https://confluentinc.github.io/cp-docker-images/)
