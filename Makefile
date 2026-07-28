.PHONY: help build build-all start stop logs clean test docker-build docker-up docker-down

DOCKER_COMPOSE = docker-compose
MAVEN_CMD = mvn

help:
	@echo "Ecommerce Microservices - Available Commands"
	@echo ""
	@echo "Docker Commands:"
	@echo "  make docker-up              Start all services with Docker Compose"
	@echo "  make docker-down            Stop all services"
	@echo "  make docker-logs            View all service logs"
	@echo "  make docker-logs-products   View products service logs"
	@echo "  make docker-logs-cart       View cart service logs"
	@echo "  make docker-logs-inventory  View inventory service logs"
	@echo ""
	@echo "Build Commands:"
	@echo "  make build-products         Build products service"
	@echo "  make build-cart             Build cart service"
	@echo "  make build-inventory        Build inventory service"
	@echo "  make build-gateway          Build gateway"
	@echo "  make build-all              Build all services"
	@echo ""
	@echo "Local Run Commands:"
	@echo "  make run-products           Run products service locally"
	@echo "  make run-cart               Run cart service locally"
	@echo "  make run-inventory          Run inventory service locally"
	@echo "  make run-gateway            Run gateway locally"
	@echo ""
	@echo "Infrastructure:"
	@echo "  make infra-up               Start only database & kafka infrastructure"
	@echo "  make infra-down             Stop infrastructure"
	@echo ""
	@echo "Testing:"
	@echo "  make test-products          Run products service tests"
	@echo "  make test-cart              Run cart service tests"
	@echo "  make test-inventory         Run inventory service tests"
	@echo "  make test-all               Run all tests"
	@echo ""
	@echo "Utilities:"
	@echo "  make clean                  Clean all build artifacts"
	@echo "  make logs                   View all Docker logs"
	@echo "  make status                 Show status of all services"
	@echo "  make kafka-topics           List Kafka topics"
	@echo ""

# ============================================================================
# Docker Compose Commands
# ============================================================================

docker-up:
	@echo "Starting all services with Docker Compose..."
	$(DOCKER_COMPOSE) up -d
	@echo "Waiting for services to be healthy..."
	@sleep 10
	@$(DOCKER_COMPOSE) ps

docker-down:
	@echo "Stopping all services..."
	$(DOCKER_COMPOSE) down

docker-logs:
	$(DOCKER_COMPOSE) logs -f

docker-logs-products:
	$(DOCKER_COMPOSE) logs -f products-service

docker-logs-cart:
	$(DOCKER_COMPOSE) logs -f cart-service

docker-logs-inventory:
	$(DOCKER_COMPOSE) logs -f inventory-service

docker-ps:
	$(DOCKER_COMPOSE) ps

# ============================================================================
# Build Commands
# ============================================================================

build-all:
	@echo "Building all services..."
	cd spring && $(MAVEN_CMD) clean package -DskipTests -q

build-products:
	@echo "Building products service..."
	cd spring && $(MAVEN_CMD) clean package -DskipTests -pl products -q

build-cart:
	@echo "Building cart service..."
	cd spring && $(MAVEN_CMD) clean package -DskipTests -pl cart -q

build-inventory:
	@echo "Building inventory service..."
	cd spring && $(MAVEN_CMD) clean package -DskipTests -pl inventory -q

build-gateway:
	@echo "Building gateway..."
	cd spring && $(MAVEN_CMD) clean package -DskipTests -pl gateway -q

# ============================================================================
# Local Run Commands
# ============================================================================

run-products:
	@echo "Starting Products Service (http://localhost:8083)"
	cd spring/products && $(MAVEN_CMD) spring-boot:run

run-cart:
	@echo "Starting Cart Service (http://localhost:8084)"
	cd spring/cart && $(MAVEN_CMD) spring-boot:run

run-inventory:
	@echo "Starting Inventory Service (http://localhost:8085)"
	cd spring/inventory && $(MAVEN_CMD) spring-boot:run

run-gateway:
	@echo "Starting Gateway (http://localhost:8080)"
	cd spring/gateway && $(MAVEN_CMD) spring-boot:run

# ============================================================================
# Infrastructure Only
# ============================================================================

infra-up:
	@echo "Starting infrastructure only..."
	$(DOCKER_COMPOSE) up -d products-db cart-db inventory-db kafka zookeeper redis

infra-down:
	@echo "Stopping infrastructure..."
	$(DOCKER_COMPOSE) down

# ============================================================================
# Testing
# ============================================================================

test-all:
	@echo "Running all tests..."
	cd spring && $(MAVEN_CMD) test

test-products:
	@echo "Running products service tests..."
	cd spring && $(MAVEN_CMD) test -pl products

test-cart:
	@echo "Running cart service tests..."
	cd spring && $(MAVEN_CMD) test -pl cart

test-inventory:
	@echo "Running inventory service tests..."
	cd spring && $(MAVEN_CMD) test -pl inventory

# ============================================================================
# Utility Commands
# ============================================================================

clean:
	@echo "Cleaning all build artifacts..."
	cd spring && $(MAVEN_CMD) clean

status:
	@$(DOCKER_COMPOSE) ps

logs:
	$(DOCKER_COMPOSE) logs -f

# ============================================================================
# Kafka Utilities
# ============================================================================

kafka-topics:
	docker exec ecom_kafka kafka-topics --list --bootstrap-server localhost:9092

kafka-cart-events:
	docker exec ecom_kafka kafka-console-consumer --topic cart-events --from-beginning --bootstrap-server localhost:9092

kafka-inventory-events:
	docker exec ecom_kafka kafka-console-consumer --topic inventory-events --from-beginning --bootstrap-server localhost:9092
