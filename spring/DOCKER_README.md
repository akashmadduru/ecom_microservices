# Docker Setup for E-Commerce Microservices

This guide explains how to run all Spring Boot microservices using Docker and Docker Compose.

## Prerequisites

- Docker Engine (version 20.10+)
- Docker Compose (version 2.0+)

## Services

The docker-compose setup includes:

### Infrastructure Services
- **PostgreSQL 16**: Database server for all microservices
- **Redis 7**: In-memory cache and session store
- **Kafka 7.5**: Message broker for event-driven communication
- **Zookeeper**: Kafka coordination service

### Application Services
- **API Gateway** (port 8080): Spring Cloud Gateway (Netty/WebFlux)
- **Auth Service** (port 8001): JWT authentication & user management
- **Product Service** (port 8081): Product catalog management
- **Inventory Service** (port 8082): Stock and reservation management

## Quick Start

### 1. Build Docker Images

```bash
cd spring/
docker-compose build
```

This builds images for all 4 microservices using multi-stage builds:
- Maven build stage: Compiles code and packages JARs
- Runtime stage: Minimal Alpine JRE images (21 LTS)

**First build time**: 10-15 minutes (Maven downloads dependencies)
**Subsequent builds**: 2-3 minutes (cached layers)

### 2. Start All Services

```bash
docker-compose up -d
```

**Start time**: 30-45 seconds (all services start in parallel)

### 3. Verify Services Are Running

```bash
docker-compose ps
```

You should see all 7 containers (4 apps + 3 infrastructure) in "Up" state.

### 4. Check Logs

```bash
# View all logs
docker-compose logs -f

# View specific service
docker-compose logs -f auth-service
docker-compose logs -f product-service
docker-compose logs -f inventory-service
docker-compose logs -f api-gateway
```

### 5. Test the API

Once all services are running:

```bash
# Health check via API Gateway
curl http://localhost:8080/

# Direct service access
curl http://localhost:8001/auth/health  # Auth Service
curl http://localhost:8081/products/health  # Product Service
curl http://localhost:8082/inventory/health  # Inventory Service
```

## Database Initialization

PostgreSQL databases are automatically created on first run via `init-databases.sql`:
- `ecom_auth`: User credentials and tokens
- `ecom_product`: Product catalog data
- `ecom_inventory`: Stock levels and reservations

Credentials (defined in docker-compose.yml):
- Username: `ecom_user`
- Password: `ecom_password`
- Host: `postgres` (from container network)

## Stopping Services

```bash
# Stop all running containers
docker-compose down

# Stop and remove volumes (clean state)
docker-compose down -v

# Stop and remove volumes + images
docker-compose down -v --rmi all
```

## Troubleshooting

### Services won't start - check PostgreSQL

```bash
docker-compose logs postgres
```

Wait for: "database system is ready to accept connections"

### Maven dependency download fails

Check internet connection and Maven repo availability:

```bash
docker-compose build --no-cache --progress=plain
```

### Port already in use

Change ports in docker-compose.yml:
```yaml
ports:
  - "8000:8080"  # Changed from 8080:8080
```

### View resource usage

```bash
docker stats
```

Typical memory usage:
- Product Service: 400-600MB
- Auth Service: 300-500MB
- Inventory Service: 300-500MB
- API Gateway: 200-400MB
- PostgreSQL: 50-150MB
- Redis: 5-20MB
- Kafka: 300-500MB

## Docker Compose Configuration

### Build Context

- Context: `spring/` directory
- Dockerfiles: `./services/{service}/Dockerfile`
- All builds copy the full source tree for Maven multi-module build

### Environment Variables

Services receive PostgreSQL connection strings via environment variables:
- `SPRING_DATASOURCE_URL`: JDBC connection string
- `SPRING_DATASOURCE_USERNAME`: Database user
- `SPRING_DATASOURCE_PASSWORD`: Database password
- `SPRING_REDIS_HOST`: Redis host
- `SPRING_KAFKA_BOOTSTRAP_SERVERS`: Kafka broker URL

### Health Checks

All infrastructure services include health checks:
- PostgreSQL: `pg_isready` command
- Redis: `redis-cli ping`
- Kafka: broker API version check

Services depend on these health checks before starting.

### Network

All services connect via `ecom_network` bridge network:
- Internal DNS: service name (e.g., `postgres:5432`)
- External access: localhost + mapped ports

## Development Tips

### Rebuild single service

```bash
docker-compose build product-service
docker-compose up -d product-service
```

### Run service in foreground to see logs

```bash
docker-compose up auth-service
```

### Execute command in running container

```bash
docker-compose exec product-service java -version
```

### Shell into container

```bash
docker-compose exec postgres psql -U ecom_user -d ecom_product
docker-compose exec redis redis-cli
```

## Production Considerations

This setup is for local development. For production:

1. **Secrets Management**: Use environment files or secrets manager (not hardcoded)
2. **Resource Limits**: Add CPU/memory limits to docker-compose
3. **Logging**: Configure centralized logging (ELK, Splunk, etc.)
4. **Monitoring**: Add Prometheus/Grafana for metrics
5. **Backup**: Implement PostgreSQL backup strategy
6. **Load Balancing**: Add HAProxy or nginx for production routing
7. **Image Registry**: Push images to Docker Hub/ECR instead of local build

## Architecture

```
Client
  ↓
API Gateway (8080)
  ├→ Auth Service (8001)
  ├→ Product Service (8081)
  └→ Inventory Service (8082)
       ↓
    PostgreSQL (5432)
    Redis (6379)
    Kafka (9092)
```

All services share:
- PostgreSQL for persistence
- Redis for caching/sessions
- Kafka for async events (Product ↔ Inventory)

## Additional Resources

- [Spring Boot Docker](https://spring.io/guides/gs/spring-boot-docker/)
- [Docker Compose Reference](https://docs.docker.com/compose/compose-file/)
- [Best Practices for Java Containers](https://docs.docker.com/language/java/)
