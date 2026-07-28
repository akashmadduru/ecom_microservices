# Postman Collection - Complete API Testing Guide

## 📥 Import Collection into Postman

### Step 1: Download Collection
- File: `postman-collection.json` (in project root)
- Location: `/Users/akash/Desktop/projects/ecom_microservices/postman-collection.json`

### Step 2: Import into Postman
1. Open Postman Desktop or Web
2. Click **Import** (top-left)
3. Select **Upload Files** tab
4. Choose `postman-collection.json`
5. Click **Import** → Collection appears in left sidebar

### Step 3: Set Variables
1. Click **Variables** tab (in collection)
2. Set `access_token` - After signin, copy JWT from response
3. Set `refresh_token` - After signin, copy refresh JWT
4. Click **Save**

---

## 🔑 Quick Test Flow (Step-by-Step)

### Phase 1: Authentication

**1. Signup (Create Account)**
- Request: `POST /auth/signup`
- Body: Username, email, password
- Response: User object (save user_id)
- Status: ✅ 201 Created

**2. Signin (Get Tokens)**
- Request: `POST /auth/signin`
- Body: username=test_user, password=password123
- Response: access_token, refresh_token
- **Copy tokens to Postman variables** (auth header)
- Status: ✅ 200 OK

**3. Validate Token**
- Request: `GET /auth/validate`
- Header: Authorization: Bearer {{access_token}}
- Response: Current user info
- Status: ✅ 200 OK

---

### Phase 2: Products (CRUD)

**4. List Products**
- Request: `GET /products`
- No auth needed
- Response: Array of all products
- Status: ✅ 200 OK

**5. Get Single Product**
- Request: `GET /products/{product_id}`
- Use any ID from products list
- Response: Single product detail
- Status: ✅ 200 OK

**6. Create Product**
- Request: `POST /products`
- Header: Authorization: Bearer {{access_token}}
- Body: name, description, price, stock
- Response: Created product with ID
- **Save product_id for cart operations**
- Status: ✅ 201 Created

**7. Update Product**
- Request: `PUT /products/{product_id}`
- Body: Updated fields
- Status: ✅ 200 OK

**8. Delete Product**
- Request: `DELETE /products/{product_id}`
- Status: ✅ 204 No Content

---

### Phase 3: Shopping Cart (Event-Driven!)

**9. Get/Create Cart**
- Request: `GET /carts/{user_id}`
- Header: Authorization: Bearer {{access_token}}
- Response: Cart object (empty or with items)
- Status: ✅ 200 OK

**10. Add Item to Cart ⚡ TRIGGERS EVENT**
- Request: `POST /carts/{user_id}/items`
- Header: Authorization: Bearer {{access_token}}
- Body: product_id, quantity, price
- **Event: AddedToCartEvent published to Kafka**
- **Inventory Service consumes event & reserves stock**
- Response: Cart with new item
- Status: ✅ 201 Created

**What happens behind the scenes:**
```
Cart Service (creates item)
    ↓
Publishes AddedToCartEvent
    ↓
Kafka message broker
    ↓
Inventory Service (listens)
    ↓
Reserves stock automatically
    ↓
Publishes InventoryReservedEvent
```

**11. Update Cart Item**
- Request: `PUT /carts/{user_id}/items/{item_id}`
- Body: quantity (new value)
- Status: ✅ 200 OK

**12. Remove Item from Cart ⚡ TRIGGERS EVENT**
- Request: `DELETE /carts/{user_id}/items/{item_id}`
- Header: Authorization: Bearer {{access_token}}
- **Event: RemovedFromCartEvent published**
- **Inventory releases reserved stock**
- Status: ✅ 204 No Content

**13. Checkout ⚡ TRIGGERS EVENT**
- Request: `POST /carts/{user_id}/checkout`
- Header: Authorization: Bearer {{access_token}}
- Body: shipping_address, payment_method
- **Event: CheckoutInitiatedEvent published**
- Response: Order confirmation
- Status: ✅ 200 OK

---

### Phase 4: Inventory (Event Consumer)

**14. Get Stock Level**
- Request: `GET /inventory/{product_id}`
- Header: Authorization: Bearer {{access_token}}
- Response: available_stock, reserved_stock, total
- **reserved_stock increases when item added to cart (event-driven)**
- Status: ✅ 200 OK

**15. Get User Reservations**
- Request: `GET /inventory/reserved/{user_id}`
- Header: Authorization: Bearer {{access_token}}
- Response: All active reservations for user
- Status: ✅ 200 OK

**16. Manual Stock Reserve**
- Request: `PUT /inventory/{product_id}/reserve`
- Body: user_id, quantity
- Response: Reservation created
- Status: ✅ 200 OK

---

### Phase 5: Monitoring & Health

**17. Health Checks (All Services)**
- Auth Service: `GET http://localhost:8082/actuator/health`
- Products: `GET http://localhost:8083/actuator/health`
- Cart: `GET http://localhost:8084/actuator/health`
- Inventory: `GET http://localhost:8085/actuator/health`
- Status: ✅ 200 OK (healthy if "status": "UP")

**18. Circuit Breaker Status**
- Request: `GET /cart/actuator/circuitbreakers`
- Response: State (CLOSED, OPEN, HALF_OPEN)
- Status: ✅ 200 OK

**19. Metrics (Prometheus)**
- Request: `GET /cart/actuator/prometheus`
- Response: All metrics in Prometheus format
- Use in Grafana dashboards
- Status: ✅ 200 OK

---

## 🎯 Complete Test Scenario

Run this sequence to test entire system:

```
1. Signup (create new user)
   ↓
2. Signin (get tokens)
   ↓
3. List Products (see available items)
   ↓
4. Add to Cart (triggers AddedToCartEvent)
   ↓
5. Check Inventory (verify stock reserved)
   ↓
6. Add Another Item (more inventory events)
   ↓
7. Update Cart Item (change quantity)
   ↓
8. Get Cart (see current items)
   ↓
9. Checkout (triggers CheckoutInitiatedEvent)
   ↓
10. Check Inventory Again (reservations should be released/confirmed)
    ↓
11. Check Metrics (see all metrics in Prometheus)
    ↓
12. Check Health (all services healthy)
```

---

## 📊 Event Flow Verification

After adding item to cart, verify event was processed:

**In Prometheus (http://localhost:9090):**

```promql
# Check cart metrics
cart_items_added_total

# Check inventory metrics
inventory_reservations_active

# Check error rates
rate(http_server_requests_seconds_count{status=~"5.."}[5m])
```

**In Grafana (http://localhost:3000):**
- Go to **Service Health Dashboard**
- Look for: Cart items added counter, Inventory reservations gauge
- Both should update in real-time as you add/remove items

---

## 🔐 Authentication Setup

All requests to **Cart**, **Inventory** services require JWT token:

```
Authorization: Bearer <your_jwt_token_here>
```

### Get Token:
1. Send signin request
2. Copy `access_token` from response
3. Add to Postman environment variable: `{{access_token}}`
4. Use in Authorization header

### Token Expires:
- Access token: 15 minutes
- Refresh token: 7 days

### Refresh Token:
```
POST /auth/token/refresh
Body: { "refresh_token": "{{refresh_token}}" }
```

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| 401 Unauthorized | Token expired or wrong. Re-signin to get new token |
| 404 Not Found | Product/cart doesn't exist. Use valid IDs |
| 409 Conflict | Duplicate username. Use unique username for signup |
| 503 Service Unavailable | Service restarting. Wait 30 seconds and retry |
| Events not triggering | Check Kafka is running: `docker-compose ps` |
| Inventory not reserved | Check Inventory Service logs: `docker logs ecom_inventory` |

---

## 📚 Headers Reference

### For All Authenticated Requests:
```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

### For Signin (special):
```
Content-Type: application/x-www-form-urlencoded
(send as form data, not JSON)
```

---

## ✅ Success Criteria

| Feature | Endpoint | Expected Status |
|---------|----------|-----------------|
| Signup | POST /auth/signup | 201 |
| Signin | POST /auth/signin | 200 |
| Get User | GET /auth/users/me | 200 |
| List Products | GET /products | 200 |
| Create Product | POST /products | 201 |
| Get Cart | GET /carts/{user_id} | 200 |
| Add to Cart | POST /carts/{user_id}/items | 201 |
| Get Inventory | GET /inventory/{product_id} | 200 |
| Checkout | POST /carts/{user_id}/checkout | 200 |
| Health Check | GET /actuator/health | 200 |

All endpoints returning correct status codes = ✅ System Working!

---

## 🚀 Next: View in Dashboards

After running requests:

1. **Grafana**: http://localhost:3000
   - Username: admin
   - Password: admin
   - View "Business Metrics" dashboard
   - See cart items added, conversions, inventory reservations

2. **Prometheus**: http://localhost:9090
   - Query: `cart_items_added_total`
   - Query: `inventory_reservations_active`
   - View all service metrics

3. **Kafka Events**: Check logs
   - `docker logs ecom_kafka` - Message flow
   - `docker logs ecom_inventory_service` - Event consumption

---

## 💡 Tips

- **Set collection-level auth** in Postman Authorization tab → Use Bearer token
- **Use Pre-request Scripts** in Postman to auto-copy tokens from signin response
- **Create test data flow** → Save responses → Reuse IDs in next requests
- **Monitor in Grafana** while running requests to see real-time metrics
- **Check logs** if anything fails: `docker logs ecom_<service_name>`

Happy testing! 🎉
