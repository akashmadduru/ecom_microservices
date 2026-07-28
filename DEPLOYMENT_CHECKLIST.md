# E-commerce Microservices - Deployment Checklist

## Pre-Deployment Verification

Use this checklist to verify the Docker Compose setup is complete and ready for deployment.

### Setup Validation

- [ ] Run `./scripts/validate-setup.sh` and verify no errors
- [ ] All required ports are available (5431-5434, 6379, 2181, 9092, 8080-8085, 9090, 3000)
- [ ] Minimum 4GB RAM available for Docker
- [ ] At least 10GB free disk space
- [ ] Docker daemon is running
- [ ] PostgreSQL client tools installed (`psql`, `pg_isready`)

### Configuration Files

- [ ] `.env` file created (copy from `.env.example`)
- [ ] `.env` values reviewed and updated if needed
- [ ] `docker-compose.yml` exists and contains all 12 services
- [ ] All SQL initialization scripts present in `scripts/sql/`
- [ ] All shell scripts in `scripts/` are executable (755 permissions)

### Project Structure

```
ecom_microservices/
├── docker-compose.yml                ✓
├── .env                              ✓
├── .env.example                      ✓
├── QUICKSTART.md                     ✓
├── DOCKER_README.md                  ✓
├── DEPLOYMENT_CHECKLIST.md          ✓
├── scripts/
│   ├── init-databases.sh            ✓
│   ├── start-services.sh            ✓
│   ├── seed-data.sh                 ✓
│   ├── validate-setup.sh            ✓
│   ├── health-check.sh              ✓
│   └── sql/
│       ├── 01-auth_db.sql           ✓
│       ├── 02-products_db.sql       ✓
│       ├── 03-cart_db.sql           ✓
│       └── 04-inventory_db.sql      ✓
└── spring/
    ├── auth/Dockerfile
    ├── gateway/Dockerfile
    ├── products/Dockerfile
    ├── cart/Dockerfile
    └── inventory/Dockerfile
```

## Deployment Steps

### Step 1: Validate Setup
```bash
./scripts/validate-setup.sh
```

**Expected Output:**
- All prerequisite checks pass
- No errors reported
- Summary shows "Setup is valid and ready to use!"

**Checklist:**
- [ ] Docker is installed
- [ ] docker-compose is installed
- [ ] Docker daemon is running
- [ ] PostgreSQL client tools available
- [ ] All required ports available
- [ ] Sufficient disk space and memory

### Step 2: Initialize Databases
```bash
./scripts/init-databases.sh
```

**Expected Output:**
```
=== E-commerce Microservices Database Initialization ===

Starting Docker containers...
✓ Docker Compose services started

Initializing databases...
✓ Waiting for auth_db to be ready... Ready!
✓ Initializing auth_db... Done!
✓ Waiting for products_db to be ready... Ready!
✓ Initializing products_db... Done!
✓ Waiting for cart_db to be ready... Ready!
✓ Initializing cart_db... Done!
✓ Waiting for inventory_db to be ready... Ready!
✓ Initializing inventory_db... Done!

=== Initialization Summary ===
✓ All databases initialized successfully!

Database Connection Details:
Auth DB:      localhost:5431
Products DB:  localhost:5432
Cart DB:      localhost:5433
Inventory DB: localhost:5434
```

**Checklist:**
- [ ] No timeout errors
- [ ] All databases initialized successfully
- [ ] Sample data loaded
- [ ] Database connections verified

### Step 3: Start All Services
```bash
./scripts/start-services.sh
```

**Expected Output:**
```
=== E-commerce Microservices Docker Startup ===

Starting Docker Compose services...
✓ Docker Compose services started

Waiting for services to be ready...
✓ Waiting for auth-db to be ready... Ready!
✓ Waiting for products-db to be ready... Ready!
... (all services listed)

=== Service Endpoints ===

Core Services:
API Gateway:      http://localhost:8080
Auth Service:     http://localhost:8082
Products Service: http://localhost:8083
Cart Service:     http://localhost:8084
Inventory Service:http://localhost:8085

... (additional endpoints)

✓ All services started successfully!
```

**Checklist:**
- [ ] No error messages
- [ ] All services show "Ready!"
- [ ] Startup time < 90 seconds
- [ ] Service endpoints are correct

### Step 4: Verify Health Status
```bash
./scripts/health-check.sh
```

**Expected Output:**
```
=== E-commerce Microservices - Health Check ===

Databases:
✓ Auth DB (5431) (available)
✓ Products DB (5432) (available)
✓ Cart DB (5433) (available)
✓ Inventory DB (5434) (available)

Infrastructure:
✓ Redis (responding)
✓ Zookeeper (responding)
✓ Kafka (responding)

Microservices:
✓ Auth Service (healthy)
✓ Products Service (healthy)
✓ Cart Service (healthy)
✓ Inventory Service (healthy)
✓ API Gateway (healthy)

Monitoring:
✓ Prometheus (responding)
✓ Grafana (responding)

=== Health Summary ===
Healthy:   12
Starting:  0
Unhealthy: 0

✓ All services are healthy!
```

**Checklist:**
- [ ] All 12 services healthy
- [ ] No "unhealthy" services
- [ ] All databases available
- [ ] All endpoints responding

### Step 5: Test Service Connectivity

```bash
# Test API Gateway
curl -i http://localhost:8080/actuator/health

# Test Auth Service
curl -i http://localhost:8082/actuator/health

# Test Products Service
curl -i http://localhost:8083/actuator/health

# Test Prometheus
curl -i http://localhost:9090/-/healthy
```

**Expected Output:**
```json
{
  "status": "UP",
  "components": {
    "db": {"status": "UP"},
    "kafka": {"status": "UP"},
    "redis": {"status": "UP"}
  }
}
```

**Checklist:**
- [ ] All services return HTTP 200
- [ ] Status shows "UP"
- [ ] All components healthy
- [ ] No connection errors

### Step 6: Verify Database Connectivity

```bash
# Test Auth DB
psql -h localhost -U postgres -p 5431 -d auth_db -c "SELECT COUNT(*) FROM users;"

# Test Products DB
psql -h localhost -U postgres -p 5432 -d products_db -c "SELECT COUNT(*) FROM products;"

# Test Cart DB
psql -h localhost -U postgres -p 5433 -d cart_db -c "SELECT COUNT(*) FROM carts;"

# Test Inventory DB
psql -h localhost -U postgres -p 5434 -d inventory_db -c "SELECT COUNT(*) FROM inventory;"
```

**Expected Output:**
```
 count
-------
     3
(1 row)
```

**Checklist:**
- [ ] All databases respond
- [ ] Tables contain sample data
- [ ] No connection errors
- [ ] No permission denied errors

### Step 7: Load Additional Sample Data (Optional)

```bash
./scripts/seed-data.sh
```

**Expected Output:**
```
=== E-commerce Microservices - Seed Data ===

Seeding auth_db...
✓ auth_db seeded

Seeding products_db...
✓ products_db seeded

... (all databases seeded)

=== Data Verification ===

Users:
 user_count
------------
          7
(1 row)

Products:
 product_count
---------------
             25
(1 row)

... (more verification)

✓ All databases seeded successfully!
```

**Checklist:**
- [ ] All databases seeded without errors
- [ ] Data verification shows expected counts
- [ ] No duplicate key errors

## Runtime Verification

### Container Status
```bash
docker-compose ps
```

Should show all 12 containers as "Up" with "healthy" status.

### Log Monitoring
```bash
# Real-time logs
docker-compose logs -f

# Specific service logs
docker-compose logs -f products-service

# Last 50 lines
docker-compose logs -n 50
```

### Docker Resource Usage
```bash
# View resource usage
docker stats

# Disk space
docker system df
```

## Monitoring Dashboards

### Prometheus
- **URL**: http://localhost:9090
- **Metrics**: Services availability, request rates, error rates
- **Query**: Try `up` to see service status

### Grafana
- **URL**: http://localhost:3000
- **Default Login**: admin / admin
- **Dashboards**: Spring Boot Metrics, JVM Metrics, PostgreSQL

## Sample Service Calls

### Create User (Auth Service)
```bash
curl -X POST http://localhost:8082/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "newuser",
    "email": "user@example.com",
    "password": "securepass123"
  }'
```

### Get Products (Products Service)
```bash
curl http://localhost:8083/api/products \
  -H "Accept: application/json"
```

### Get Cart (Cart Service)
```bash
curl http://localhost:8084/api/cart \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Check Inventory (Inventory Service)
```bash
curl http://localhost:8085/api/inventory/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Troubleshooting During Deployment

### Issue: Services timeout during startup
**Solution:**
1. Check logs: `docker-compose logs`
2. Wait longer (first start can take 90+ seconds)
3. Check resource availability: `docker stats`
4. Restart: `docker-compose restart`

### Issue: Database connection errors
**Solution:**
1. Verify database is running: `docker-compose ps | grep -db`
2. Check database logs: `docker-compose logs products-db`
3. Test connectivity: `psql -h localhost -U postgres -p 5432`
4. Re-initialize: `./scripts/init-databases.sh`

### Issue: Port already in use
**Solution:**
1. Find process: `lsof -i :8080`
2. Kill process: `kill -9 <PID>`
3. Or use different port in `docker-compose.yml`

### Issue: Out of memory
**Solution:**
1. Check usage: `docker stats`
2. Reduce JVM heap: Change `JAVA_TOOL_OPTIONS` to `-Xmx256m`
3. Stop unused containers

## Post-Deployment Tasks

- [ ] **Configure monitoring**: Set up Grafana dashboards
- [ ] **Update secrets**: Change default passwords in production
- [ ] **Enable TLS**: Set up HTTPS with reverse proxy
- [ ] **Configure backups**: Set up database backup schedule
- [ ] **Document APIs**: Generate OpenAPI/Swagger documentation
- [ ] **Set up alerting**: Configure Prometheus alert rules
- [ ] **Performance tuning**: Optimize database and JVM settings
- [ ] **Security review**: Audit access controls and firewall rules

## Rollback Procedure

If deployment encounters issues, rollback with:

```bash
# Stop all services
docker-compose down

# Option 1: Restart services
./scripts/start-services.sh

# Option 2: Full reset (warns data loss)
docker-compose down -v
./scripts/init-databases.sh
./scripts/start-services.sh
```

## Success Criteria

Deployment is successful when:

- ✓ All 12 containers running and healthy
- ✓ All databases initialized with schema and sample data
- ✓ All services responding to health checks
- ✓ Database connectivity verified
- ✓ Service-to-service communication working
- ✓ Monitoring dashboards accessible
- ✓ Sample data queries return expected results
- ✓ No error logs in docker-compose output

## Performance Benchmarks

Expected metrics after successful deployment:

| Metric | Expected Value |
|--------|-----------------|
| Startup time | 60-90 seconds |
| Health check success rate | 100% |
| Database response time | < 50ms |
| Service response time | < 200ms |
| Memory usage per service | 256-512MB |
| Disk space used | 2-3GB |

## Support and Escalation

If issues persist after following this checklist:

1. **Collect diagnostics:**
   ```bash
   docker-compose logs > deployment.log
   docker ps -a > containers.txt
   df -h > disk_usage.txt
   ```

2. **Check documentation:**
   - `QUICKSTART.md` - Quick start guide
   - `DOCKER_README.md` - Detailed Docker setup
   - `spring/MICROSERVICES_SETUP.md` - Service-specific setup

3. **Review logs:**
   - Service logs: `docker-compose logs`
   - Specific service: `docker-compose logs <service>`
   - Database logs: `docker-compose logs <db-service>`

---

**Deployment Date**: _________
**Deployed By**: _________
**Environment**: [ ] Development [ ] Staging [ ] Production
**Notes**: 

