# E-commerce Microservices - Quick Start Guide

## Overview

This is a complete Docker Compose setup for a multi-service e-commerce platform with:
- 4 Spring Boot microservices (Auth, Products, Cart, Inventory)
- 4 PostgreSQL databases
- API Gateway (Spring Cloud Gateway)
- Redis for caching and session management
- Kafka for event streaming
- Prometheus & Grafana for monitoring

## Prerequisites

- Docker & Docker Compose (v3.8+)
- PostgreSQL client tools (`psql`, `pg_isready`)
- Bash shell
- At least 4GB RAM available for Docker
- Ports 5431-5434, 6379, 2181, 9092, 8080-8085, 9090, 3000 available

### Install Requirements

**macOS:**
```bash
# Install Docker Desktop (includes Docker and Docker Compose)
brew install --cask docker

# Install PostgreSQL client tools
brew install libpq
brew link --force libpq
```

**Ubuntu/Debian:**
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install PostgreSQL client tools
sudo apt-get install postgresql-client
```

## Quick Start (3 steps)

### Step 1: Configure Environment

```bash
cd /Users/akash/Desktop/projects/ecom_microservices
cp .env.example .env

# Edit .env if needed (default credentials are postgres/postgres)
# nano .env
```

### Step 2: Initialize Databases

```bash
# Make scripts executable
chmod +x scripts/*.sh

# Initialize all databases
./scripts/init-databases.sh

# Verify initialization succeeded (check for green checkmarks)
```

### Step 3: Start Services

```bash
# Start all Docker containers
./scripts/start-services.sh

# Wait for all services to become healthy (60 seconds max)
# Watch the output for green checkmarks
```

That's it! All services should now be running and healthy.

## Service Endpoints

### Core Services
- **API Gateway**: http://localhost:8080
  - Main entry point for all client requests
  - Handles authentication and routing

- **Auth Service**: http://localhost:8082/actuator/health
  - User authentication and authorization
  - JWT token management
  
- **Products Service**: http://localhost:8083/actuator/health
  - Product catalog management
  - Product search and filtering

- **Cart Service**: http://localhost:8084/actuator/health
  - Shopping cart operations
  - Add/remove items, manage quantities

- **Inventory Service**: http://localhost:8085/actuator/health
  - Stock management
  - Reservation tracking

### Infrastructure
- **Redis**: `redis://localhost:6379`
  - Session cache
  - Cache layer

- **Kafka**: `localhost:9092`
  - Event streaming
  - Service-to-service messaging

- **Zookeeper**: `localhost:2181`
  - Kafka coordination

### Databases
- **Auth DB**: `postgresql://localhost:5431/auth_db`
- **Products DB**: `postgresql://localhost:5432/products_db`
- **Cart DB**: `postgresql://localhost:5433/cart_db`
- **Inventory DB**: `postgresql://localhost:5434/inventory_db`

Default credentials: `postgres / postgres`

### Monitoring
- **Prometheus**: http://localhost:9090
  - Metrics collection
  - Query and visualize metrics

- **Grafana**: http://localhost:3000
  - Dashboards
  - Alerts and visualizations
  - Default login: `admin / admin`

## Database Schema

### Auth DB (auth_db)
```
users
├── id (UUID, PK)
├── username (VARCHAR, UNIQUE)
├── email (VARCHAR, UNIQUE)
├── password_hash (VARCHAR)
├── role (VARCHAR) - USER, SELLER, ADMIN
├── provider (VARCHAR) - local, google, etc
├── is_active (BOOLEAN)
└── created_at, updated_at (TIMESTAMP)
```

### Products DB (products_db)
```
products
├── id (BIGSERIAL, PK)
├── name (VARCHAR)
├── description (TEXT)
├── price (NUMERIC)
├── stock (INTEGER)
└── created_at, updated_at (TIMESTAMP)
```

### Cart DB (cart_db)
```
carts
├── id (BIGSERIAL, PK)
├── user_id (VARCHAR)
└── created_at, updated_at (TIMESTAMP)

cart_items
├── id (BIGSERIAL, PK)
├── cart_id (BIGINT, FK -> carts)
├── product_id (BIGINT)
├── quantity (INTEGER)
├── price (NUMERIC)
└── added_at (TIMESTAMP)
```

### Inventory DB (inventory_db)
```
inventory
├── id (BIGSERIAL, PK)
├── product_id (BIGINT, UNIQUE)
├── available_stock (INTEGER)
├── reserved_stock (INTEGER)
└── last_updated (TIMESTAMP)

reservations
├── id (BIGSERIAL, PK)
├── product_id (BIGINT)
├── user_id (VARCHAR)
├── quantity (INTEGER)
├── reserved_at (TIMESTAMP)
├── expires_at (TIMESTAMP)
└── is_released (BOOLEAN)
```

## Sample Data

The initialization scripts automatically populate:
- **10 sample products** in products_db
- **3 sample users** in auth_db (admin, customer, seller)
- **3 sample carts** with items in cart_db
- **10 inventory records** with stock levels in inventory_db

### Sample Credentials

| Username | Email | Password | Role |
|----------|-------|----------|------|
| admin_user | admin@ecom.local | password123 | ADMIN |
| test_user | user@ecom.local | password123 | USER |
| seller_user | seller@ecom.local | password123 | SELLER |

## Common Tasks

### View Logs
```bash
# View all service logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f auth-service
docker-compose logs -f products-service
docker-compose logs -f cart-service

# View last 100 lines
docker-compose logs -n 100
```

### Stop Services
```bash
# Stop all containers (data persists)
docker-compose down

# Stop and remove volumes (data deleted)
docker-compose down -v
```

### Restart a Service
```bash
docker-compose restart products-service
```

### View Running Services
```bash
docker-compose ps
```

### Add More Sample Data
```bash
./scripts/seed-data.sh
```

### Access Database Directly
```bash
# Connect to Auth DB
psql -h localhost -U postgres -p 5431 -d auth_db

# Connect to Products DB
psql -h localhost -U postgres -p 5432 -d products_db

# List tables
\dt

# Query data
SELECT * FROM products LIMIT 5;
```

### Health Checks

All services have automated health checks that run every 15 seconds. Check health status:

```bash
# Check all container health
docker-compose ps

# Example output:
# NAME              STATE                    PORTS
# ecom_auth_db      Up 1 minute (healthy)    5431/tcp
# ecom_products_db  Up 1 minute (healthy)    5432/tcp
# ecom_kafka        Up 1 minute (healthy)    9092/tcp
# ecom_auth_service Up 1 minute (healthy)    8082/tcp
```

## Troubleshooting

### Services not starting

1. **Check Docker is running:**
   ```bash
   docker ps
   ```

2. **Check logs for errors:**
   ```bash
   docker-compose logs
   ```

3. **Verify ports are available:**
   ```bash
   # Check if ports are in use
   lsof -i :8080
   lsof -i :5432
   ```

4. **Clean and restart:**
   ```bash
   docker-compose down -v
   ./scripts/init-databases.sh
   ./scripts/start-services.sh
   ```

### Database connection errors

1. **Verify database health:**
   ```bash
   docker-compose logs products-db
   ```

2. **Check database is initialized:**
   ```bash
   psql -h localhost -U postgres -p 5432 -d products_db -c "SELECT COUNT(*) FROM products;"
   ```

3. **Re-initialize database:**
   ```bash
   ./scripts/init-databases.sh
   ```

### Services not healthy

1. **Check service logs:**
   ```bash
   docker-compose logs auth-service
   ```

2. **Verify dependencies started:**
   ```bash
   docker-compose ps | grep -E "kafka|zookeeper|redis"
   ```

3. **Wait longer (first start can take 60+ seconds):**
   ```bash
   sleep 30
   ./scripts/start-services.sh
   ```

### Port conflicts

If ports are already in use, you have two options:

1. **Stop conflicting services:**
   ```bash
   # Find process using port
   lsof -i :8080
   # Kill the process
   kill -9 <PID>
   ```

2. **Modify docker-compose.yml** to use different ports:
   ```yaml
   services:
     api-gateway:
       ports:
         - "8081:8080"  # Changed from 8080:8080
   ```

## Performance Notes

- First startup takes 60-90 seconds as containers initialize
- Database health checks run every 10 seconds
- Service health checks run every 15 seconds
- Redis is configured with persistence enabled
- Kafka auto-creates topics on first use

## Security Considerations

**IMPORTANT: These are development defaults. For production:**

1. **Change default credentials** in `.env`:
   ```bash
   DB_PASSWORD=your-strong-password-here
   JWT_SECRET=your-long-random-secret-here
   GRAFANA_PASSWORD=your-strong-password
   ```

2. **Use secrets management** (AWS Secrets Manager, HashiCorp Vault)

3. **Enable TLS/HTTPS** for all connections

4. **Restrict port exposure** with firewall rules

5. **Update default Grafana password** on first login

6. **Review and update JWT expiration** based on security requirements

## Next Steps

1. **Review service code**: Check `spring/*/src/main/java/`
2. **Customize configuration**: Edit `spring/*/src/main/resources/application.yml`
3. **Add business logic**: Implement service-specific features
4. **Configure monitoring**: Set up Grafana dashboards
5. **Set up CI/CD**: Configure GitLab CI or GitHub Actions

## Documentation

- **Architecture**: See `ARCHITECTURE.md`
- **API Documentation**: Swagger/OpenAPI at `http://localhost:8080/api/docs`
- **Service Setup**: See `spring/MICROSERVICES_SETUP.md`

## Support

For issues and questions:
1. Check logs: `docker-compose logs`
2. Review troubleshooting section above
3. Check database initialization: `./scripts/init-databases.sh`
4. Verify all health checks: `docker-compose ps`

## Cleanup

To remove all containers and data:

```bash
# Stop and remove everything
docker-compose down -v

# Remove Docker images (optional)
docker rmi postgres:15-alpine redis:7-alpine confluentinc/cp-kafka:7.5.0 prom/prometheus:latest grafana/grafana:latest
```

---

**Last Updated**: 2026-07-28
**Spring Boot Version**: 4.1.0
**Java Version**: 25
