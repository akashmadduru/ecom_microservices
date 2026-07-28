# 🚀 Run & Test - Complete Guide

## ⚡ Quick Start (4 Steps)

### Step 1: Start Docker Compose
```bash
cd /Users/akash/Desktop/projects/ecom_microservices
docker-compose up -d
```

Wait 60 seconds for services to start...

### Step 2: Check Services
```bash
docker-compose ps
# All containers should show "Up" status
# If any are "Restarting", check logs: docker logs <container_name>
```

### Step 3: Import Postman Collection
1. Open Postman
2. Click **Import** (top-left)
3. Upload: `postman-collection.json` (from project root)
4. Collection loads with 20+ endpoints

### Step 4: Test Everything
1. Go to **1. Authentication** folder
2. Run **Signin** request
3. Copy `access_token` from response
4. Paste into Postman environment: `access_token`
5. Run requests in order (2-6)

---

## 📋 Service Status & Ports

| Service | Port | Expected Status |
|---------|------|-----------------|
| **API Gateway** | 8080 | UP |
| **Auth Service** | 8082 | UP |
| **Products Service** | 8083 | UP |
| **Cart Service** | 8084 | UP |
| **Inventory Service** | 8085 | UP |
| **Prometheus** | 9090 | UP |
| **Grafana** | 3000 | UP |
| **Kafka** | 9092 | UP |
| **PostgreSQL** | 5432 | UP |
| **Redis** | 6379 | UP |

**Check all services:**
```bash
for port in 8080 8082 8083 8084 8085 3000 9090; do
  echo "=== Port $port ===" && curl -s http://localhost:$port/actuator/health | jq . || echo "DOWN"
done
```

---

## 🧪 Test Sequence (Copy-Paste)

### 1. Authentication Flow
```bash
# Signin
curl -X POST http://localhost:8082/api/v1/auth/signin \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=test_user&password=password123"

# Copy access_token from response, then:
export TOKEN="<your_token_here>"

# Validate token
curl -X GET http://localhost:8082/api/v1/auth/users/me \
  -H "Authorization: Bearer $TOKEN"
```

### 2. Products Flow
```bash
# List all products
curl http://localhost:8083/api/v1/products

# Save a product_id and use it:
export PRODUCT_ID="<product_id>"

# Get single product
curl http://localhost:8083/api/v1/products/$PRODUCT_ID
```

### 3. Cart Flow (EVENTS!)
```bash
export USER_ID="user123"

# Get/Create cart
curl -X GET http://localhost:8084/api/v1/carts/$USER_ID \
  -H "Authorization: Bearer $TOKEN"

# Add item to cart (TRIGGERS EVENT)
curl -X POST http://localhost:8084/api/v1/carts/$USER_ID/items \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"product_id\": \"$PRODUCT_ID\", \"quantity\": 2, \"price\": 99.99}"

# Check Kafka logs to see event:
docker logs ecom_kafka | grep "AddedToCartEvent"
```

### 4. Inventory Flow (EVENT CONSUMER)
```bash
# Get stock (should show reserved_stock increased)
curl -X GET http://localhost:8085/api/v1/inventory/$PRODUCT_ID \
  -H "Authorization: Bearer $TOKEN"

# Get user reservations
curl -X GET http://localhost:8085/api/v1/inventory/reserved/$USER_ID \
  -H "Authorization: Bearer $TOKEN"
```

### 5. Monitoring
```bash
# Health checks
curl http://localhost:8084/actuator/health | jq .

# Metrics
curl http://localhost:8084/actuator/prometheus | head -20

# Circuit breaker
curl http://localhost:8084/actuator/circuitbreakers | jq .
```

---

## 📊 View Dashboards

### Grafana (Business Metrics)
```
URL: http://localhost:3000
Login: admin / admin
Dashboards:
  1. Service Health (circuit breaker status, errors, latency)
  2. Business Metrics (carts, checkouts, inventory)
  3. Resource Utilization (JVM, database, CPU)
```

### Prometheus (Raw Metrics)
```
URL: http://localhost:9090
Queries:
  - cart_items_added_total (counter)
  - inventory_reservations_active (gauge)
  - resilience4j_circuitbreaker_state (circuit breaker health)
  - http_server_requests_seconds (latency histogram)
```

---

## 🔍 Debug Commands

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker logs ecom_inventory_service -f

# Kafka events
docker logs ecom_kafka | grep -i "event"

# Database
docker logs ecom_postgres
```

### Check Databases
```bash
# Auth DB
psql -U auth_user -d auth_db -h localhost -p 5432 -c "SELECT * FROM users;"

# Products DB
psql -U products_user -d products_db -h localhost -p 5432 -c "SELECT * FROM products;"

# Inventory DB
psql -U inventory_user -d inventory_db -h localhost -p 5432 -c "SELECT * FROM inventory;"
```

### Kafka Messages
```bash
# List topics
docker exec ecom_kafka kafka-topics --list --bootstrap-server localhost:9092

# Read cart-events
docker exec ecom_kafka kafka-console-consumer --bootstrap-server localhost:9092 \
  --topic cart-events --from-beginning
```

---

## ✅ Verify Everything Works

Run this checklist:

- [ ] All 10 containers "Up" (docker-compose ps)
- [ ] Auth signin returns tokens
- [ ] Products list returns items
- [ ] Add to cart succeeds (201)
- [ ] Inventory shows reserved stock
- [ ] Grafana loads (admin/admin)
- [ ] Prometheus returns metrics
- [ ] Cart service health = UP
- [ ] Inventory service health = UP
- [ ] Circuit breaker = CLOSED

✅ All checked = System ready!

---

## 🧹 Cleanup

### Stop Everything
```bash
docker-compose down
```

### Remove Volumes (DELETE DATA)
```bash
docker-compose down -v
```

### Restart Specific Service
```bash
docker-compose restart ecom_cart_service
```

---

## 📝 Postman Collection Features

**Pre-configured:**
- ✅ 20+ endpoints
- ✅ Variables for tokens (access_token, refresh_token)
- ✅ Authentication headers pre-filled
- ✅ Request/response examples
- ✅ All micro service URLs
- ✅ Health check endpoints
- ✅ Dashboard links

**Collections:**
1. Authentication (7 endpoints)
2. Products CRUD (5 endpoints)
3. Cart & Events (5 endpoints)
4. Inventory (3 endpoints)
5. Monitoring (6 endpoints)

**Total: 26 endpoints to test**

---

## 🚀 Full Test Scenario (5 Minutes)

1. **Signin** (5s) → Copy token
2. **List Products** (5s) → Copy product_id
3. **Add to Cart** (5s) → Watch events trigger
4. **Check Inventory** (5s) → See reserved stock
5. **View Grafana** (10s) → See metrics in real-time
6. **Check Health** (10s) → All services UP
7. **View Prometheus** (10s) → Query metrics

**Total time: ~5-10 minutes to test everything**

---

## 💡 Tips & Tricks

**Save tokens in Postman:**
1. Run Signin request
2. In Tests tab, add:
```javascript
var jsonData = pm.response.json();
pm.environment.set("access_token", jsonData.access_token);
pm.environment.set("refresh_token", jsonData.refresh_token);
```
3. Tokens auto-save after signin!

**Watch events in real-time:**
```bash
# Terminal 1: Watch Kafka
docker logs ecom_kafka -f | grep -i "event"

# Terminal 2: Run Postman requests
# See events flow through Kafka in real-time!
```

**Monitor metrics:**
```bash
# Terminal 1: Run requests
# In another terminal:
watch -n 1 'curl -s http://localhost:8084/actuator/prometheus | grep cart_items'

# Metrics update every request!
```

---

## 🆘 Troubleshooting

| Error | Solution |
|-------|----------|
| `Connection refused` | Services not running. Run `docker-compose up -d` |
| `401 Unauthorized` | Token expired. Re-run Signin request |
| `503 Service Unavailable` | Service restarting. Wait 30s |
| `Kafka connection error` | Kafka not ready. Wait another 30s |
| `Database connection error` | PostgreSQL not ready. Check `docker logs ecom_postgres` |
| `Auth service restarts` | Java/Lombok issue. Check: `docker logs ecom_auth_service` |

---

## 📞 Contact

Need help? Check:
1. **POSTMAN_IMPORT_GUIDE.md** - Detailed test guide
2. **MONITORING.md** - Metrics & alerts
3. **EVENT_DRIVEN_ARCHITECTURE.md** - Event flow details
4. **docker-compose logs** - Service logs
5. **Grafana dashboards** - Real-time status

---

## 🎉 You're Ready!

Everything is set up and ready to test. Just:

```bash
docker-compose up -d
open http://localhost:3000  # Grafana
open postman-collection.json # Import
```

Start testing! 🚀
