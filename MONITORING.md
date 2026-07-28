# E-Commerce Microservices Monitoring Guide

This guide covers monitoring, metrics, and observability for the e-commerce microservices platform using Prometheus, Grafana, and Resilience4j Circuit Breakers.

## Overview

The monitoring stack includes:
- **Prometheus**: Metrics collection and storage (port 9090)
- **Grafana**: Dashboards and visualization (port 3000)
- **Resilience4j**: Circuit breaker pattern for fault tolerance
- **Micrometer**: Metrics facade with Spring Boot integration

## Quick Start

### Start the Full Stack

```bash
cd /Users/akash/Desktop/projects/ecom_microservices
docker-compose up -d
```

This starts:
- 5 Microservices (Auth, Products, Cart, Inventory, Gateway)
- Databases (PostgreSQL, Redis)
- Kafka & Zookeeper
- Prometheus (metrics collection)
- Grafana (visualization)

### Access the Monitoring Tools

1. **Prometheus**: http://localhost:9090
   - Query metrics using PromQL
   - View service health and circuit breaker status
   - Configure alerts

2. **Grafana**: http://localhost:3000
   - Default credentials: `admin` / `admin` (change on first login)
   - Pre-configured dashboards:
     - Service Health Dashboard
     - Business Metrics Dashboard
     - Resource Utilization Dashboard

3. **Service Metrics Endpoints** (individual services):
   - Products: http://localhost:8083/actuator/prometheus
   - Cart: http://localhost:8084/actuator/prometheus
   - Inventory: http://localhost:8085/actuator/prometheus
   - Gateway: http://localhost:8080/actuator/prometheus

4. **Service Health Check** (actuator):
   - Products: http://localhost:8083/actuator/health
   - Cart: http://localhost:8084/actuator/health
   - Inventory: http://localhost:8085/actuator/health
   - Gateway: http://localhost:8080/actuator/health

## Circuit Breaker Configuration

### What is a Circuit Breaker?

A circuit breaker is a resilience pattern that:
- **CLOSED**: Calls pass through normally (healthy state)
- **OPEN**: Calls are blocked immediately (service down/unhealthy)
- **HALF_OPEN**: Limited calls allowed to test if service recovered

### Configuration

Circuit breakers are configured in each service's `application.yaml`:

```yaml
resilience4j:
  circuitbreaker:
    instances:
      products-getProduct:
        failure-rate-threshold: 50          # Open after 50% failures
        slow-call-rate-threshold: 50        # Slow calls count as failures
        slow-call-duration-threshold: 2000ms # Calls >2s are slow
        wait-duration-in-open-state: 30000ms # Wait 30s before trying again
        permitted-number-of-calls-in-half-open-state: 3  # Allow 3 test calls
        automatic-transition-from-open-to-half-open-enabled: true
        recordable-exceptions:
          - java.io.IOException
          - org.springframework.web.client.HttpClientErrorException
        ignore-exceptions:
          - java.lang.IllegalArgumentException
```

### Monitoring Circuit Breakers

#### Prometheus Queries

```promql
# Circuit breaker state (1 = active)
resilience4j_circuitbreaker_state{name="products-getProduct"}

# Calls rejected by circuit breaker
rate(resilience4j_circuitbreaker_calls_total{kind="not_permitted"}[5m])

# Error rate
rate(resilience4j_circuitbreaker_calls_total{kind="failure"}[5m])

# Slow calls
rate(resilience4j_circuitbreaker_calls_total{kind="slow_success"}[5m])
```

#### Grafana Dashboard: Service Health

The **Service Health Dashboard** shows:
- Circuit breaker status for all services
- Request rates and error rates
- Response time percentiles (p95, p99)
- HTTP request duration trends

#### Alert Rules (in `prometheus/alert-rules.yml`)

The following alerts are configured:

1. **CircuitBreakerOpen** (Warning)
   - Triggered when circuit breaker is in OPEN state for >2 minutes
   - Indicates service is unavailable

2. **CircuitBreakerHalfOpen** (Info)
   - Triggered when circuit breaker is in HALF_OPEN state for >1 minute
   - Indicates service is recovering

## Metrics by Service

### Products Service Metrics

**Business Metrics:**
- `products.viewed` (Counter) - Product view count
- `products.search` (Counter) - Search query count
- `products.added` (Counter) - Products added to catalog
- `products.removed` (Counter) - Products removed from catalog
- `products.fetched` (Counter) - Product fetch operations
- `products.catalog.total` (Gauge) - Total products in catalog
- `products.catalog.active` (Gauge) - Active products

**Performance Metrics:**
- `http_server_requests_seconds` - HTTP request duration
- `jvm_memory_used_bytes` - JVM memory usage

### Cart Service Metrics

**Business Metrics:**
- `cart.items.added` (Counter) - Items added to carts
- `cart.items.removed` (Counter) - Items removed from carts
- `cart.checkout.initiated` (Counter) - Checkout operations started
- `cart.checkout.completed` (Counter) - Checkout operations completed
- `cart.active.count` (Gauge) - Active shopping carts
- `cart.items.total` (Gauge) - Total items across all carts

**Performance Metrics:**
- `http_server_requests_seconds` - HTTP request duration
- `hikaricp_connections_active` - Database connection pool usage

### Inventory Service Metrics

**Business Metrics:**
- `inventory.reservations.created` (Counter) - Inventory reservations
- `inventory.reservations.released` (Counter) - Reservations released
- `inventory.low_stock.alerts` (Counter) - Low stock alerts
- `inventory.replenished` (Counter) - Inventory replenishment
- `inventory.adjustments` (Counter) - Stock adjustments
- `inventory.reservations.active` (Gauge) - Active reservations
- `inventory.low_stock.count` (Gauge) - Products with low stock
- `inventory.stock.total` (Gauge) - Total stock

**Performance Metrics:**
- `http_server_requests_seconds` - HTTP request duration
- `jvm_threads_live` - JVM thread count

## Prometheus Metrics Query Examples

### Service Availability

```promql
# Up/Down status (1 = up, 0 = down)
up{job="products-service"}

# Request rate by service
rate(http_server_requests_seconds_count[5m])

# Error rate (5xx responses)
rate(http_server_requests_seconds_count{status=~"5.."}[5m])
```

### Performance

```promql
# Average response time
rate(http_server_requests_seconds_sum[5m]) / rate(http_server_requests_seconds_count[5m])

# P95 response time (95th percentile)
histogram_quantile(0.95, rate(http_server_requests_seconds_bucket[5m]))

# P99 response time (99th percentile)
histogram_quantile(0.99, rate(http_server_requests_seconds_bucket[5m]))
```

### Resource Utilization

```promql
# JVM Heap Memory usage percentage
jvm_memory_used_bytes{area="heap"} / jvm_memory_max_bytes{area="heap"}

# Database connection pool usage
hikaricp_connections_active / hikaricp_connections_max

# JVM thread count
jvm_threads_live
```

### Business Metrics

```promql
# Total items added to carts (24h)
increase(cart_items_added_total[24h])

# Total checkouts initiated (24h)
increase(cart_checkout_initiated_total[24h])

# Active inventory reservations
inventory_reservations_active

# Products with low stock
inventory_low_stock_count
```

## Grafana Dashboards

### 1. Service Health Dashboard

**Purpose**: Monitor service availability and performance

**Key Panels**:
- Circuit breaker status by service
- Request rate and error rate by endpoint
- Response time percentiles (p95, p99)
- HTTP request duration trends
- Error rate (5xx) over time

**Use Cases**:
- Detect service degradation
- Monitor circuit breaker transitions
- Identify slow endpoints
- Track error spikes

### 2. Business Metrics Dashboard

**Purpose**: Track business-level KPIs

**Key Panels**:
- Items added to carts (24h count)
- Checkout operations initiated (24h count)
- Active inventory reservations (gauge)
- Products with low stock (gauge)
- Cart items added rate (per hour)
- Inventory reservations over time
- Top viewed products (24h)

**Use Cases**:
- Monitor conversion funnel (add to cart -> checkout)
- Track product popularity
- Monitor inventory health
- Identify sales trends

### 3. Resource Utilization Dashboard

**Purpose**: Monitor system resource consumption

**Key Panels**:
- JVM heap memory usage (gauge)
- Database connection pool usage (gauge)
- JVM thread count (stat)
- JVM memory used (bytes)
- JVM heap memory trend (time series)
- JVM thread count trend (time series)
- Database connection pool trend (time series)

**Use Cases**:
- Detect memory leaks
- Monitor database connection pool saturation
- Identify thread exhaustion issues
- Capacity planning

## Alert Rules

Alerts are configured in `monitoring/alert-rules.yml` and evaluated by Prometheus every 30 seconds.

### Alert Severity Levels

- **critical**: Requires immediate action (service down)
- **warning**: Service degradation, may need attention
- **info**: Informational alerts

### Common Alerts

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| ServiceDown | Service doesn't respond to health checks | critical | Check service logs, restart if needed |
| CircuitBreakerOpen | Circuit breaker in OPEN state for >2m | warning | Investigate downstream service health |
| HighErrorRate | Error rate >5% for >5m | warning | Check service logs, look for exceptions |
| HighResponseTime | P95 response time >2s for >5m | warning | Check database/network, profile service |
| HighJVMMemoryUsage | Heap usage >85% for >5m | warning | Check for memory leaks, increase heap |
| HighDatabaseConnectionUsage | Connection pool >80% for >5m | warning | Increase pool size or optimize queries |
| LowInventoryStock | Products with low stock >0 | info | Replenish inventory |

## Troubleshooting

### Prometheus shows no data

1. Check if services are healthy:
   ```bash
   curl http://localhost:8083/actuator/health
   curl http://localhost:8084/actuator/health
   curl http://localhost:8085/actuator/health
   ```

2. Check Prometheus targets: http://localhost:9090/targets

3. Check if services are exporting metrics:
   ```bash
   curl http://localhost:8083/actuator/prometheus
   ```

### Circuit breaker stuck in OPEN state

1. Check service logs for errors
2. Monitor response times: should drop below 2 seconds
3. Monitor error rate: should drop below 50%
4. Circuit breaker will automatically transition to HALF_OPEN after 30 seconds

### High memory usage

1. Check if there's a memory leak:
   ```promql
   jvm_memory_used_bytes{area="heap"}
   ```

2. If continuously growing, take a heap dump and analyze

3. Increase JVM heap size in docker-compose.yml:
   ```yaml
   environment:
     JAVA_TOOL_OPTIONS: "-Xmx1g"  # Increase from 512m to 1g
   ```

### Database connection pool exhausted

1. Check connection pool usage:
   ```promql
   hikaricp_connections_active / hikaricp_connections_max
   ```

2. Increase pool size in `application.yaml`:
   ```yaml
   spring:
     datasource:
       hikari:
         maximum-pool-size: 20  # Increase from 10
   ```

3. Optimize slow queries
4. Monitor query execution time

### Missing metrics from a service

1. Verify service has actuator dependency in pom.xml
2. Check management endpoints are exposed in `application.yaml`:
   ```yaml
   management:
     endpoints:
       web:
         exposure:
           include: health,info,metrics,prometheus
   ```

3. Verify Prometheus can reach the service endpoint:
   ```bash
   curl http://service-name:port/actuator/prometheus
   ```

## Performance Tuning

### Prometheus Optimization

1. **Retention**: Data is kept for 15 days by default
   - Adjust in docker-compose.yml: `--storage.tsdb.retention.time=30d`
   - More retention = more disk space

2. **Scrape Interval**: Default is 15 seconds
   - Reduce for more granular data (uses more storage)
   - Increase for less detailed data (saves storage)

3. **Database Size**: Check Prometheus disk usage
   ```bash
   du -sh /var/lib/docker/volumes/prometheus_data/_data
   ```

### Grafana Optimization

1. **Dashboard Refresh Rate**: Set to 30s (balance between freshness and load)
2. **Query Performance**: Use recording rules for expensive queries
3. **Panel Type**: Some panel types are more resource-intensive than others

### Circuit Breaker Tuning

**Aggressive (fail fast)**:
- `failure-rate-threshold: 30%`
- `slow-call-duration-threshold: 1000ms`
- `wait-duration-in-open-state: 10000ms`
- Good for critical services

**Conservative (tolerate occasional failures)**:
- `failure-rate-threshold: 70%`
- `slow-call-duration-threshold: 3000ms`
- `wait-duration-in-open-state: 60000ms`
- Good for less critical services

## Best Practices

1. **Monitor business metrics**, not just infrastructure
2. **Set meaningful alerts** - avoid alert fatigue
3. **Use time series data** - look at trends, not just current values
4. **Document your dashboards** - explain what each metric means
5. **Review alerts regularly** - adjust thresholds based on actual patterns
6. **Track circuit breaker events** - use them as early warning signals
7. **Test failover scenarios** - simulate circuit breaker open state
8. **Correlate metrics** - look for patterns across services

## Additional Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/grafana/latest/)
- [Resilience4j Circuit Breaker](https://resilience4j.readme.io/docs/circuitbreaker)
- [Spring Boot Actuator](https://docs.spring.io/spring-boot/docs/current/reference/html/actuator.html)
- [Micrometer Documentation](https://micrometer.io/docs)

## Support

For issues or questions about monitoring:
1. Check service logs: `docker logs ecom_products_service`
2. Review Prometheus alerts: http://localhost:9090/alerts
3. Check Grafana datasource health in Grafana UI
4. Review this guide for troubleshooting sections
