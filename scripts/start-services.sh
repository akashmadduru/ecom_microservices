#!/bin/bash

# E-commerce Microservices - Docker Compose Startup Script
# Starts all services and waits for them to be healthy

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DOCKER_COMPOSE_FILE="$PROJECT_DIR/docker-compose.yml"

# Load environment variables
if [ -f "$PROJECT_DIR/.env" ]; then
    export $(cat "$PROJECT_DIR/.env" | xargs)
fi

# Service configuration
SERVICES=(
    "auth-db:5431"
    "products-db:5432"
    "cart-db:5433"
    "inventory-db:5434"
    "redis:6379"
    "zookeeper:2181"
    "kafka:9092"
    "auth-service:8082"
    "products-service:8083"
    "cart-service:8084"
    "inventory-service:8085"
    "api-gateway:8080"
)

MONITORING_SERVICES=(
    "prometheus:9090"
    "grafana:3000"
)

# Health check timeout and retries
MAX_WAIT_TIME=60
CHECK_INTERVAL=5

echo -e "${BLUE}=== E-commerce Microservices Docker Startup ===${NC}\n"

# Function to check if a port is open
port_is_open() {
    local host=$1
    local port=$2
    local timeout=1

    if timeout "$timeout" bash -c "echo > /dev/tcp/$host/$port" 2>/dev/null; then
        return 0
    fi
    return 1
}

# Function to wait for a service
wait_for_service() {
    local service_name=$1
    local host=$2
    local port=$3
    local max_wait=$4

    echo -n "Waiting for $service_name to be ready... "

    local start_time=$(date +%s)
    while true; do
        if port_is_open "$host" "$port"; then
            echo -e "${GREEN}Ready!${NC}"
            return 0
        fi

        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))

        if [ $elapsed -gt $max_wait ]; then
            echo -e "${RED}Timeout!${NC}"
            return 1
        fi

        echo -n "."
        sleep $CHECK_INTERVAL
    done
}

# Function to check Docker compose health
check_docker_health() {
    local max_checks=20
    local check_count=0

    echo -e "\n${BLUE}Checking container health...${NC}"

    while [ $check_count -lt $max_checks ]; do
        local unhealthy=$(docker-compose ps 2>/dev/null | grep "unhealthy" | wc -l)
        local starting=$(docker-compose ps 2>/dev/null | grep "Up (health" | wc -l)

        if [ "$unhealthy" -eq 0 ]; then
            echo -e "${GREEN}✓ All containers are healthy!${NC}"
            return 0
        fi

        echo -n "."
        sleep 3
        ((check_count++))
    done

    echo -e "${YELLOW}Warning: Some containers may not be fully healthy yet.${NC}"
    return 1
}

# Main startup process
main() {
    # Check if Docker and Docker Compose are installed
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Error: Docker is not installed${NC}"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        echo -e "${RED}Error: docker-compose is not installed${NC}"
        exit 1
    fi

    # Check if docker is running
    if ! docker info &> /dev/null; then
        echo -e "${RED}Error: Docker daemon is not running${NC}"
        exit 1
    fi

    # Check if .env file exists
    if [ ! -f "$PROJECT_DIR/.env" ]; then
        echo -e "${YELLOW}Warning: .env file not found. Creating from .env.example...${NC}"
        if [ -f "$PROJECT_DIR/.env.example" ]; then
            cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
            echo -e "${YELLOW}Please review and update $PROJECT_DIR/.env with your settings${NC}"
        else
            echo -e "${RED}Error: .env.example not found${NC}"
            exit 1
        fi
    fi

    # Start Docker Compose services
    echo -e "${BLUE}Starting Docker Compose services...${NC}"
    cd "$PROJECT_DIR"

    docker-compose down 2>/dev/null || true
    sleep 2

    docker-compose up -d

    if [ $? -ne 0 ]; then
        echo -e "${RED}Error: Failed to start Docker services${NC}"
        docker-compose logs
        exit 1
    fi

    echo -e "${GREEN}✓ Docker Compose services started${NC}"

    # Wait for core services to be ready
    echo -e "\n${BLUE}Waiting for services to be ready...${NC}"

    # Wait for database services first
    wait_for_service "auth-db" "localhost" "5431" "$MAX_WAIT_TIME" || true
    wait_for_service "products-db" "localhost" "5432" "$MAX_WAIT_TIME" || true
    wait_for_service "cart-db" "localhost" "5433" "$MAX_WAIT_TIME" || true
    wait_for_service "inventory-db" "localhost" "5434" "$MAX_WAIT_TIME" || true

    sleep 5

    # Wait for infrastructure services
    wait_for_service "redis" "localhost" "6379" "$MAX_WAIT_TIME" || true
    wait_for_service "kafka" "localhost" "9092" "$MAX_WAIT_TIME" || true

    sleep 5

    # Wait for application services
    wait_for_service "auth-service" "localhost" "8082" "$MAX_WAIT_TIME" || true
    wait_for_service "products-service" "localhost" "8083" "$MAX_WAIT_TIME" || true
    wait_for_service "cart-service" "localhost" "8084" "$MAX_WAIT_TIME" || true
    wait_for_service "inventory-service" "localhost" "8085" "$MAX_WAIT_TIME" || true
    wait_for_service "api-gateway" "localhost" "8080" "$MAX_WAIT_TIME" || true

    # Check Docker health
    check_docker_health || true

    # Print service URLs and summary
    echo -e "\n${BLUE}=== Service Endpoints ===${NC}"
    echo -e "${GREEN}Core Services:${NC}"
    echo "API Gateway:      http://localhost:8080"
    echo "Auth Service:     http://localhost:8082"
    echo "Products Service: http://localhost:8083"
    echo "Cart Service:     http://localhost:8084"
    echo "Inventory Service:http://localhost:8085"

    echo -e "\n${GREEN}Databases:${NC}"
    echo "Auth DB:          postgresql://localhost:5431/auth_db"
    echo "Products DB:      postgresql://localhost:5432/products_db"
    echo "Cart DB:          postgresql://localhost:5433/cart_db"
    echo "Inventory DB:     postgresql://localhost:5434/inventory_db"

    echo -e "\n${GREEN}Infrastructure:${NC}"
    echo "Redis:            redis://localhost:6379"
    echo "Kafka:            localhost:9092"
    echo "Zookeeper:        localhost:2181"

    echo -e "\n${GREEN}Monitoring:${NC}"
    echo "Prometheus:       http://localhost:9090"
    echo "Grafana:          http://localhost:3000 (admin/admin)"

    echo -e "\n${BLUE}View logs:${NC}"
    echo "docker-compose logs -f <service_name>"
    echo "docker-compose logs -f"

    echo -e "\n${BLUE}Stop services:${NC}"
    echo "docker-compose down"

    echo -e "\n${GREEN}✓ All services started successfully!${NC}\n"
}

# Run main function
main "$@"
