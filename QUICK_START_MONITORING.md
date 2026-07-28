# Quick Start: Monitoring & Circuit Breakers

## 30-Second Setup

```bash
# Navigate to project root
cd /Users/akash/Desktop/projects/ecom_microservices

# Start all services with monitoring
docker-compose up -d

# Wait for services to be healthy (30-60 seconds)
docker-compose ps

# Open Grafana
open http://localhost:3000
```

## Default Credentials

| Tool | URL | User | Password |
|------|-----|------|----------|
| Grafana | http://localhost:3000 | admin | admin |
| Prometheus | http://localhost:9090 | - | - |

## Service Health URLs

| Service | Health | Metrics |
|---------|--------|---------|
| Products | http://localhost:8083/actuator/health | http://localhost:8083/actuator/prometheus |
| Cart | http://localhost:8084/actuator/health | http://localhost:8084/actuator/prometheus |
| Inventory | http://localhost:8085/actuator/health | http://localhost:8085/actuator/prometheus |
| Gateway | http://localhost:8080/actuator/health | http://localhost:8080/actuator/prometheus |

## Pre-Built Dashboards

After logging into Grafana (http://localhost:3000):

1. **Service Health Dashboard**
   - Shows circuit breaker status
   - Request/error rates by service
   - Response time percentiles

2. **Business Metrics Dashboard**
   - Cart items added, checkouts initiated
   - Active reservations, low stock alerts
   - Product views and searches

3. **Resource Utilization Dashboard**
   - JVM memory and thread usage
   - Database connection pool
   - CPU and disk metrics

## Common Tasks

### Check Service Status

```bash
# Check if service is healthy
curl http://localhost:8083/actuator/health | jq

# View raw metrics (Prometheus format)
curl http://localhost:8083/actuator/prometheus | head -20

# Check circuit breaker state
curl http://localhost:8084/actuator/circuitbreakers | jq
```

### Monitor Specific Metrics

**In Prometheus (http://localhost:9090):**

```promql
# Error rate across all services
rate(http_server_requests_seconds_count{status=~"5.."}[5m])

# Circuit breaker status
resilience4j_circuitbreaker_state

# Database connection pool usage
hikaricp_connections_active / hikaricp_connections_max

# JVM memory usage
jvm_memory_used_bytes{area="heap"} / jvm_memory_max_bytes{area="heap"}
```

### View Logs

```bash
# View logs for a specific service
docker logs ecom_products_service -f

# View Prometheus logs
docker logs ecom_prometheus -f

# View Grafana logs
docker logs ecom_grafana -f
```

## Circuit Breaker States

| State | Meaning | Action |
|-------|---------|--------|
| CLOSED | ✅ Normal operation | Calls pass through |
| OPEN | ⚠️ Service unavailable | Calls rejected immediately |
| HALF_OPEN | 🔄 Testing recovery | Limited calls allowed |

**Example**: If Cart Service has >50% failure rate for 1 minute, its circuit breaker opens and all calls to Products Service are blocked until recovery is detected.

## Troubleshooting

### Services not starting?
```bash
# Check Docker status
docker-compose ps

# View service logs
docker-compose logs products-service

# Restart services
docker-compose restart
```

### No metrics appearing?
```bash
# Verify service is exporting metrics
curl http://localhost:8083/actuator/prometheus

# Check Prometheus targets: http://localhost:9090/targets

# Restart Prometheus
docker-compose restart prometheus
```

### Grafana dashboards empty?
1. Login to Grafana (http://localhost:3000)
2. Go to Configuration > Data Sources
3. Click "Prometheus"
4. Click "Save & Test"
5. Refresh dashboard

## Environment Variables

Edit `.env` file to customize:

```bash
# Database credentials
DB_USER=postgres
DB_PASSWORD=postgres

# Grafana admin password
GRAFANA_PASSWORD=admin

# Add to docker-compose.yml if needed
JAVA_TOOL_OPTIONS: "-Xmx512m -Xms256m"
```

## Next Steps

1. **Review MONITORING.md** for comprehensive documentation
2. **Set up alerting** - Edit `monitoring/alert-rules.yml`
3. **Create custom dashboards** - Use Grafana UI
4. **Tune circuit breakers** - Adjust thresholds based on your workload

## Performance Tips

1. **Increase refresh rate** in dashboards for real-time data (consume more resources)
2. **Reduce Prometheus retention** if disk space is limited
3. **Add recording rules** for expensive queries
4. **Monitor resource usage** - check container CPU/memory limits

## Support & Documentation

- Full guide: `MONITORING.md`
- Prometheus docs: https://prometheus.io/docs/
- Grafana docs: https://grafana.com/docs/
- Resilience4j: https://resilience4j.readme.io/
