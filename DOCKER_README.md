# Docker Compose Setup for E-commerce Microservices

## Overview

This directory contains a complete, production-ready Docker Compose setup for running the e-commerce microservices platform. It includes:

- **4 PostgreSQL Databases**: Separate databases for Auth, Products, Cart, and Inventory services
- **4 Spring Boot Microservices**: Auth, Products, Cart, and Inventory services
- **API Gateway**: Spring Cloud Gateway for routing and load balancing
- **Infrastructure Services**: Redis (caching), Kafka (messaging), Zookeeper (coordination)
- **Monitoring Stack**: Prometheus and Grafana for metrics and dashboards

## Quick Start

The fastest way to get everything running:

```bash
cd /Users/akash/Desktop/projects/ecom_microservices

# 1. Validate setup (optional but recommended)
./scripts/validate-setup.sh

# 2. Initialize databases
./scripts/init-databases.sh

# 3. Start all services
./scripts/start-services.sh

# 4. Check health
./scripts/health-check.sh
```

All services should be healthy within 60 seconds.

## Project Structure

```
ecom_microservices/
├── docker-compose.yml              # Main Docker Compose configuration
├── .env.example                    # Environment variables template
├── .env                           # Environment variables (created from example)
├── QUICKSTART.md                  # Quick start guide
├── DOCKER_README.md               # This file
├── scripts/
│   ├── init-databases.sh          # Database initialization
│   ├── start-services.sh          # Service startup and health checks
│   ├── seed-data.sh              # Load sample data
│   ├── validate-setup.sh         # Validate prerequisites
│   ├── health-check.sh           # Monitor service health
│   └── sql/
│       ├── 01-auth_db.sql        # Auth database schema
│       ├── 02-products_db.sql    # Products database schema
│       ├── 03-cart_db.sql        # Cart database schema
│       └── 04-inventory_db.sql   # Inventory database schema
├── spring/
│   ├── auth/                     # Auth service (Spring Boot)
│   ├── gateway/                  # API Gateway (Spring Cloud Gateway)
│   ├── products/                 # Products service (Spring Boot)
│   ├── cart/                     # Cart service (Spring Boot)
│   └── inventory/                # Inventory service (Spring Boot)
└── monitoring/
    ├── prometheus.yml            # Prometheus configuration
    ├── alert-rules.yml           # Alert rules
    └── grafana/                  # Grafana configuration
```

## Docker Services

### Database Services

| Service | Port | Database | Description |
|---------|------|----------|-------------|
| auth-db | 5431 | auth_db | User authentication data |
| products-db | 5432 | products_db | Product catalog |
| cart-db | 5433 | cart_db | Shopping cart data |
| inventory-db | 5434 | inventory_db | Stock and reservations |

**Default Credentials**: `postgres / postgres`

### Infrastructure Services

| Service | Port | Description |
|---------|------|-------------|
| redis | 6379 | In-memory cache and session store |
| zookeeper | 2181 | Kafka coordination |
| kafka | 9092 | Event streaming broker |

### Application Services

| Service | Port | Description |
|---------|------|-------------|
| auth-service | 8082 | Authentication and authorization |
| products-service | 8083 | Product management |
| cart-service | 8084 | Shopping cart operations |
| inventory-service | 8085 | Inventory and reservations |
| api-gateway | 8080 | API Gateway and routing |

### Monitoring Services

| Service | Port | Description |
|---------|------|-------------|
| prometheus | 9090 | Metrics collection |
| grafana | 3000 | Metrics visualization |

## Environment Variables

Copy `.env.example` to `.env` and update as needed:

```bash
cp .env.example .env
```

Key variables:

```env
# Database credentials (same for all databases)
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=localhost

# JWT Configuration
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRATION=86400

# Kafka
KAFKA_BOOTSTRAP_SERVERS=localhost:9092

# Monitoring
GRAFANA_PASSWORD=admin
```

## Initialization Scripts

### validate-setup.sh
Validates that all prerequisites are installed and configured.

```bash
./scripts/validate-setup.sh
```

Checks for:
- Docker and Docker Compose installation
- PostgreSQL client tools
- Required ports availability
- Project files and scripts
- System resources (disk space, memory)

### init-databases.sh
Initializes all PostgreSQL databases with schemas and sample data.

```bash
./scripts/init-databases.sh
```

This script:
1. Starts PostgreSQL containers
2. Waits for databases to be ready
3. Loads schema and sample data from SQL files
4. Verifies successful initialization

**Note**: This is run automatically by `start-services.sh`

### start-services.sh
Starts all Docker services and waits for them to be healthy.

```bash
./scripts/start-services.sh
```

This script:
1. Stops previous containers (if any)
2. Pulls latest images
3. Starts docker-compose
4. Waits for all services to be ready
5. Displays service endpoints
6. Shows troubleshooting commands

### seed-data.sh
Adds additional test data to all databases.

```bash
./scripts/seed-data.sh
```

Adds:
- More users to auth_db
- Additional products to products_db
- Sample carts with items to cart_db
- Extra inventory records to inventory_db

### health-check.sh
Monitors the health of all services.

```bash
# Single check
./scripts/health-check.sh

# Continuous monitoring (refreshes every 5 seconds)
./scripts/health-check.sh -w

# Custom refresh interval
./scripts/health-check.sh -w 10
```

## Database Schema

### auth_db (Authentication)
```sql
users
├── id (UUID, PRIMARY KEY)
├── username (VARCHAR, UNIQUE)
├── email (VARCHAR, UNIQUE)
├── password_hash (VARCHAR)
├── role (VARCHAR) - USER, SELLER, ADMIN
├── provider (VARCHAR) - local, google, etc
├── is_active (BOOLEAN)
└── created_at, updated_at (TIMESTAMP)
```

### products_db (Product Catalog)
```sql
products
├── id (BIGSERIAL, PRIMARY KEY)
├── name (VARCHAR)
├── description (TEXT)
├── price (NUMERIC)
├── stock (INTEGER)
└── created_at, updated_at (TIMESTAMP)
```

### cart_db (Shopping Cart)
```sql
carts
├── id (BIGSERIAL, PRIMARY KEY)
├── user_id (VARCHAR)
└── created_at, updated_at (TIMESTAMP)

cart_items
├── id (BIGSERIAL, PRIMARY KEY)
├── cart_id (BIGINT, FOREIGN KEY)
├── product_id (BIGINT)
├── quantity (INTEGER)
├── price (NUMERIC)
└── added_at (TIMESTAMP)
```

### inventory_db (Stock Management)
```sql
inventory
├── id (BIGSERIAL, PRIMARY KEY)
├── product_id (BIGINT, UNIQUE)
├── available_stock (INTEGER)
├── reserved_stock (INTEGER)
└── last_updated (TIMESTAMP)

reservations
├── id (BIGSERIAL, PRIMARY KEY)
├── product_id (BIGINT)
├── user_id (VARCHAR)
├── quantity (INTEGER)
├── reserved_at (TIMESTAMP)
├── expires_at (TIMESTAMP)
└── is_released (BOOLEAN)
```

## Sample Data

The initialization includes sample data for testing:

### Users (auth_db)
- **admin_user** (ADMIN role) - admin@ecom.local
- **test_user** (USER role) - user@ecom.local
- **seller_user** (SELLER role) - seller@ecom.local
- Default password: `password123` (bcrypt hash included)

### Products (products_db)
10 sample products with prices and stock levels:
- Wireless Headphones ($99.99)
- USB-C Cable ($19.99)
- Phone Case ($29.99)
- Screen Protector Pack ($14.99)
- Portable Charger ($49.99)
- Laptop Stand ($39.99)
- Mechanical Keyboard ($149.99)
- 4K Webcam ($129.99)
- USB Hub ($34.99)
- Monitor Light Bar ($79.99)

### Carts (cart_db)
3 sample carts with items for testing cart operations

### Inventory (inventory_db)
Stock levels for all products with sample reservations

## Common Commands

### Docker Compose Commands

```bash
# Start services in background
docker-compose up -d

# View logs for all services
docker-compose logs -f

# View logs for specific service
docker-compose logs -f products-service

# Stop all services
docker-compose down

# Stop and remove all data
docker-compose down -v

# Restart specific service
docker-compose restart cart-service

# View running services and status
docker-compose ps

# View detailed service information
docker-compose ps -a
```

### Database Commands

```bash
# Connect to Auth DB
psql -h localhost -U postgres -p 5431 -d auth_db

# Connect to Products DB
psql -h localhost -U postgres -p 5432 -d products_db

# Connect to Cart DB
psql -h localhost -U postgres -p 5433 -d cart_db

# Connect to Inventory DB
psql -h localhost -U postgres -p 5434 -d inventory_db

# Query from command line
psql -h localhost -U postgres -p 5432 -d products_db -c "SELECT * FROM products LIMIT 5;"

# Execute SQL file
psql -h localhost -U postgres -p 5432 -d products_db -f script.sql
```

### Service Endpoints

```bash
# Check service health
curl http://localhost:8080/actuator/health
curl http://localhost:8082/actuator/health
curl http://localhost:8083/actuator/health
curl http://localhost:8084/actuator/health
curl http://localhost:8085/actuator/health

# Check Prometheus metrics
curl http://localhost:9090/api/v1/query?query=up
```

## Health Checks

Each service has automated health checks:

- **Databases**: PostgreSQL `pg_isready` check every 10 seconds
- **Infrastructure**: Kafka broker connectivity every 10 seconds
- **Services**: HTTP `/actuator/health` endpoint every 15 seconds
- **Monitoring**: Prometheus and Grafana endpoint checks every 10 seconds

View health status:
```bash
docker-compose ps

# Or use the provided script
./scripts/health-check.sh
```

## Troubleshooting

### Services not starting

1. **Check Docker is running:**
   ```bash
   docker ps
   ```

2. **Check logs:**
   ```bash
   docker-compose logs
   ```

3. **Check port conflicts:**
   ```bash
   lsof -i :8080
   ```

4. **Restart everything:**
   ```bash
   docker-compose down
   sleep 2
   docker-compose up -d
   ```

### Database connection errors

1. **Check database logs:**
   ```bash
   docker-compose logs products-db
   ```

2. **Verify database is running:**
   ```bash
   docker-compose ps products-db
   ```

3. **Test database connectivity:**
   ```bash
   psql -h localhost -U postgres -p 5432 -d products_db -c "SELECT 1"
   ```

### Service unhealthy

1. **View service logs:**
   ```bash
   docker-compose logs products-service
   ```

2. **Check all dependencies:**
   ```bash
   ./scripts/health-check.sh
   ```

3. **Verify environment variables:**
   ```bash
   docker-compose config | grep -A 20 "products-service"
   ```

### Out of disk space

```bash
# Check disk usage
docker system df

# Remove unused containers, images, and networks
docker system prune

# Free up significant space (warning: removes unused images)
docker system prune -a
```

### Out of memory

```bash
# Reduce Java heap size in docker-compose.yml
# Change JAVA_TOOL_OPTIONS from "-Xmx512m" to "-Xmx256m"

# Or increase Docker Desktop memory allocation
```

## Production Considerations

### Security

1. **Change default credentials:**
   ```env
   DB_PASSWORD=very-strong-password-here
   JWT_SECRET=long-random-string-suitable-for-production
   GRAFANA_PASSWORD=strong-admin-password
   ```

2. **Use secrets management:**
   - AWS Secrets Manager
   - HashiCorp Vault
   - Kubernetes Secrets (if using K8s)

3. **Enable TLS/HTTPS:**
   - Use reverse proxy (nginx, traefik)
   - Generate SSL certificates
   - Update connection strings to use TLS

4. **Restrict port exposure:**
   - Don't expose databases publicly
   - Use firewalls and security groups
   - Only expose API Gateway port (8080)

### Performance

1. **Resource allocation:**
   - Allocate adequate memory to Docker (minimum 4GB)
   - Set appropriate JVM heap sizes
   - Configure PostgreSQL shared_buffers

2. **Database optimization:**
   - Create appropriate indexes
   - Analyze query performance
   - Monitor connection pool usage

3. **Caching:**
   - Configure Redis with persistence
   - Use appropriate TTLs
   - Monitor cache hit rates

4. **Monitoring:**
   - Set up Grafana dashboards
   - Configure alert rules
   - Monitor system metrics

### Scaling

1. **Horizontal scaling:**
   - Run multiple instances of services
   - Use load balancer
   - Share databases and cache

2. **Vertical scaling:**
   - Increase JVM heap size
   - Allocate more Docker resources
   - Optimize database configuration

## Monitoring

### Prometheus Metrics
Access metrics at: http://localhost:9090

Query examples:
```
up                           # Service availability
rate(http_requests[5m])      # Request rate
jvm_memory_used_bytes        # JVM memory usage
db_connection_pool_usage     # Database connection usage
```

### Grafana Dashboards
Access dashboards at: http://localhost:3000

Default login: `admin / admin`

Pre-configured dashboards:
- JVM Metrics
- Spring Boot Application Metrics
- PostgreSQL Performance
- Kafka Topics

### Custom Dashboards

Create custom dashboards in Grafana to monitor:
- Service-specific metrics
- Business metrics
- Custom KPIs

## Docker Images

### Base Images Used
- `postgres:15-alpine` - PostgreSQL 15 (lightweight)
- `redis:7-alpine` - Redis 7 (lightweight)
- `confluentinc/cp-kafka:7.5.0` - Confluent Kafka
- `confluentinc/cp-zookeeper:7.5.0` - Zookeeper
- `prom/prometheus:latest` - Prometheus
- `grafana/grafana:latest` - Grafana

### Spring Boot Services
Built from Dockerfiles in `spring/*/Dockerfile`:
- Multi-stage builds for optimized images
- JDK 25 base image
- Health checks configured

## Network

All services are connected via a Docker network bridge:
- Network name: `ecom-network`
- Driver: bridge
- Service-to-service communication uses container names (DNS)
- Internal communication on port 29092 for Kafka
- External access through mapped ports

## Volumes

Persistent data storage:
- `auth_db_data`: Auth database files
- `products_db_data`: Products database files
- `cart_db_data`: Cart database files
- `inventory_db_data`: Inventory database files
- `redis_data`: Redis persistence
- `prometheus_data`: Metrics data
- `grafana_data`: Grafana dashboards and configs

Data is preserved when containers restart, but deleted with `docker-compose down -v`.

## Environment-Specific Configuration

### Development
```bash
# Enable debug logging
LOG_LEVEL=DEBUG
SPRING_PROFILES_ACTIVE=dev
```

### Testing
```bash
# Run with H2 embedded database (in some services)
SPRING_PROFILES_ACTIVE=test
```

### Production
```bash
# Production settings
LOG_LEVEL=WARN
SPRING_PROFILES_ACTIVE=prod
JWT_SECRET=<very-long-random-string>
```

## Logs

### View All Logs
```bash
docker-compose logs
```

### Follow Logs in Real-time
```bash
docker-compose logs -f
```

### Logs for Specific Service
```bash
docker-compose logs -f products-service
```

### Last N Lines
```bash
docker-compose logs -n 100
```

### Logs Since Specific Time
```bash
docker-compose logs --since 2024-07-28
```

## Backup and Restore

### Backup Database
```bash
# Backup single database
docker exec ecom_products_db pg_dump -U postgres products_db > products_db_backup.sql

# Backup all databases
for db in auth_db products_db cart_db inventory_db; do
  docker exec ecom_${db%-*}_db pg_dump -U postgres $db > ${db}_backup.sql
done
```

### Restore Database
```bash
# Restore single database
docker exec -i ecom_products_db psql -U postgres products_db < products_db_backup.sql

# Restore all databases
for db in auth_db products_db cart_db inventory_db; do
  docker exec -i ecom_${db%-*}_db psql -U postgres $db < ${db}_backup.sql
done
```

## Maintenance

### Regular Tasks

1. **Monitor logs**: Check for errors or warnings
2. **Check health**: Run `./scripts/health-check.sh`
3. **Monitor resources**: Check Docker memory and CPU usage
4. **Update credentials**: Rotate secrets regularly
5. **Backup data**: Regular database backups

### Cleanup

```bash
# Remove stopped containers
docker-compose down

# Remove dangling images
docker image prune

# Remove unused volumes (careful!)
docker volume prune

# Full cleanup (removes all unused images)
docker system prune -a
```

## FAQ

**Q: How do I change the database port?**
A: Update `docker-compose.yml` port mappings and `.env` variables, then rebuild.

**Q: How do I backup my data?**
A: Use `pg_dump` to backup PostgreSQL databases (see Backup section above).

**Q: Can I run services on different machines?**
A: Yes, but you'll need to update network configuration and connection strings.

**Q: How do I scale to multiple instances?**
A: Create duplicate service definitions with different names and ports, or use Kubernetes.

**Q: Are there pre-built images available?**
A: Currently built from source. For production, push to Docker registry (DockerHub, ECR, etc).

## Support and Documentation

- **Quick Start**: See `QUICKSTART.md`
- **Detailed Setup**: See `spring/MICROSERVICES_SETUP.md`
- **Architecture**: See `ARCHITECTURE.md` (if available)
- **API Documentation**: http://localhost:8080/api/docs (Swagger)

## Version Information

- **Docker Compose Version**: 3.8
- **Spring Boot Version**: 4.1.0
- **Java Version**: 25
- **PostgreSQL Version**: 15
- **Redis Version**: 7
- **Kafka Version**: 7.5.0

---

Last Updated: 2026-07-28
