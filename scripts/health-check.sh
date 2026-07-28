#!/bin/bash

# E-commerce Microservices - Health Check Script
# Monitors the health of all services and databases

set -u

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

HEALTHY=0
UNHEALTHY=0
STARTING=0

# Helper function
check_service_health() {
    local container_name=$1
    local service_name=$2
    local health_endpoint=$3

    # Check if container exists and is running
    if ! docker ps --filter "name=$container_name" --format "table {{.Names}}" 2>/dev/null | grep -q "$container_name"; then
        echo -e "${RED}✗${NC} $service_name (not running)"
        ((UNHEALTHY++))
        return
    fi

    # Get container status
    local status=$(docker inspect --format='{{.State.Status}}' "$container_name" 2>/dev/null || echo "unknown")

    if [ "$status" != "running" ]; then
        echo -e "${RED}✗${NC} $service_name (status: $status)"
        ((UNHEALTHY++))
        return
    fi

    # Check health status from Docker health check
    local health=$(docker inspect --format='{{.State.Health.Status}}' "$container_name" 2>/dev/null || echo "none")

    if [ "$health" = "healthy" ]; then
        echo -e "${GREEN}✓${NC} $service_name (healthy)"
        ((HEALTHY++))
        return
    elif [ "$health" = "starting" ]; then
        echo -e "${YELLOW}~${NC} $service_name (starting)"
        ((STARTING++))
        return
    elif [ "$health" = "unhealthy" ]; then
        echo -e "${RED}✗${NC} $service_name (unhealthy)"
        ((UNHEALTHY++))
        return
    else
        # No health check defined, try endpoint if available
        if [ -n "$health_endpoint" ]; then
            if timeout 2 curl -sf "$health_endpoint" &> /dev/null; then
                echo -e "${GREEN}✓${NC} $service_name (responding)"
                ((HEALTHY++))
            else
                echo -e "${YELLOW}~${NC} $service_name (running, endpoint not ready)"
                ((STARTING++))
            fi
        else
            echo -e "${GREEN}✓${NC} $service_name (running)"
            ((HEALTHY++))
        fi
    fi
}

# Helper function for database checks
check_database() {
    local db_name=$1
    local port=$2

    if command -v pg_isready &> /dev/null; then
        if pg_isready -h localhost -p "$port" -U postgres &> /dev/null; then
            echo -e "${GREEN}✓${NC} $db_name (available)"
            ((HEALTHY++))
            return
        fi
    fi

    # Fallback to nc if pg_isready not available
    if timeout 1 bash -c "echo > /dev/tcp/localhost/$port" &> /dev/null; then
        echo -e "${GREEN}✓${NC} $db_name (available)"
        ((HEALTHY++))
    else
        echo -e "${RED}✗${NC} $db_name (not available)"
        ((UNHEALTHY++))
    fi
}

# Main health check
main() {
    echo -e "${BLUE}=== E-commerce Microservices - Health Check ===${NC}\n"

    # Check if docker-compose is running
    if ! docker ps &> /dev/null; then
        echo -e "${RED}Error: Docker is not running${NC}"
        exit 1
    fi

    # Check if any containers are running
    if ! docker-compose ps 2>/dev/null | grep -q "ecom_"; then
        echo -e "${YELLOW}No services running. Start with: ./scripts/start-services.sh${NC}"
        exit 1
    fi

    # Database Services
    echo -e "${BLUE}Databases:${NC}"
    check_database "Auth DB (5431)" "5431"
    check_database "Products DB (5432)" "5432"
    check_database "Cart DB (5433)" "5433"
    check_database "Inventory DB (5434)" "5434"

    # Infrastructure
    echo -e "\n${BLUE}Infrastructure:${NC}"
    check_service_health "ecom_redis" "Redis" "http://localhost:6379"
    check_service_health "ecom_zookeeper" "Zookeeper" ""
    check_service_health "ecom_kafka" "Kafka" "http://localhost:9092"

    # Microservices
    echo -e "\n${BLUE}Microservices:${NC}"
    check_service_health "ecom_auth_service" "Auth Service" "http://localhost:8082/actuator/health"
    check_service_health "ecom_products_service" "Products Service" "http://localhost:8083/actuator/health"
    check_service_health "ecom_cart_service" "Cart Service" "http://localhost:8084/actuator/health"
    check_service_health "ecom_inventory_service" "Inventory Service" "http://localhost:8085/actuator/health"
    check_service_health "ecom_api_gateway" "API Gateway" "http://localhost:8080/actuator/health"

    # Monitoring
    echo -e "\n${BLUE}Monitoring:${NC}"
    check_service_health "ecom_prometheus" "Prometheus" "http://localhost:9090"
    check_service_health "ecom_grafana" "Grafana" "http://localhost:3000"

    # Summary
    echo -e "\n${BLUE}=== Health Summary ===${NC}"
    echo -e "Healthy:   ${GREEN}$HEALTHY${NC}"
    echo -e "Starting:  ${YELLOW}$STARTING${NC}"
    echo -e "Unhealthy: ${RED}$UNHEALTHY${NC}"

    echo -e "\n${BLUE}Service Endpoints:${NC}"
    echo "API Gateway:      http://localhost:8080"
    echo "Auth Service:     http://localhost:8082/actuator/health"
    echo "Products Service: http://localhost:8083/actuator/health"
    echo "Cart Service:     http://localhost:8084/actuator/health"
    echo "Inventory Service:http://localhost:8085/actuator/health"
    echo ""
    echo "Prometheus:       http://localhost:9090"
    echo "Grafana:          http://localhost:3000"

    if [ $UNHEALTHY -eq 0 ]; then
        echo -e "\n${GREEN}✓ All services are healthy!${NC}\n"
        exit 0
    elif [ $UNHEALTHY -lt 3 ]; then
        echo -e "\n${YELLOW}⚠ Some services are not ready yet (starting up)${NC}\n"
        exit 0
    else
        echo -e "\n${RED}✗ Some services are unhealthy. Check logs with: docker-compose logs${NC}\n"
        exit 1
    fi
}

# Handle continuous monitoring option
if [ "${1:-}" = "-w" ] || [ "${1:-}" = "--watch" ]; then
    INTERVAL="${2:-5}"
    while true; do
        clear
        main
        echo "Refreshing in ${INTERVAL}s... (Ctrl+C to exit)"
        sleep "$INTERVAL"
    done
else
    main
fi
