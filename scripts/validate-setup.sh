#!/bin/bash

# E-commerce Microservices - Setup Validation Script
# Validates that all prerequisites and configurations are in place

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

ERRORS=0
WARNINGS=0

echo -e "${BLUE}=== E-commerce Microservices - Setup Validation ===${NC}\n"

# Helper functions
check_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

check_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
    ((WARNINGS++))
}

check_error() {
    echo -e "${RED}✗ $1${NC}"
    ((ERRORS++))
}

# Check 1: Docker installation
echo -e "${BLUE}Checking Docker installation...${NC}"
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version)
    check_success "Docker installed: $DOCKER_VERSION"
else
    check_error "Docker is not installed"
fi

# Check 2: Docker Compose installation
echo -e "\n${BLUE}Checking Docker Compose installation...${NC}"
if command -v docker-compose &> /dev/null; then
    DC_VERSION=$(docker-compose --version)
    check_success "docker-compose installed: $DC_VERSION"
elif docker compose version &> /dev/null; then
    DC_VERSION=$(docker compose version)
    check_success "Docker Compose plugin installed: $DC_VERSION"
else
    check_error "Docker Compose is not installed"
fi

# Check 3: Docker daemon running
echo -e "\n${BLUE}Checking Docker daemon...${NC}"
if docker info &> /dev/null; then
    check_success "Docker daemon is running"
else
    check_error "Docker daemon is not running"
fi

# Check 4: PostgreSQL client tools
echo -e "\n${BLUE}Checking PostgreSQL client tools...${NC}"
if command -v psql &> /dev/null; then
    PG_VERSION=$(psql --version)
    check_success "psql installed: $PG_VERSION"
else
    check_error "psql (PostgreSQL client) is not installed"
fi

if command -v pg_isready &> /dev/null; then
    check_success "pg_isready is available"
else
    check_warning "pg_isready is not available (database health checks may fail)"
fi

# Check 5: Project files
echo -e "\n${BLUE}Checking project files...${NC}"

if [ -f "$PROJECT_DIR/docker-compose.yml" ]; then
    check_success "docker-compose.yml found"
else
    check_error "docker-compose.yml not found"
fi

if [ -f "$PROJECT_DIR/.env" ]; then
    check_success ".env file found"
elif [ -f "$PROJECT_DIR/.env.example" ]; then
    check_warning ".env file not found (using .env.example)"
else
    check_error ".env and .env.example not found"
fi

# Check 6: Scripts
echo -e "\n${BLUE}Checking scripts...${NC}"

REQUIRED_SCRIPTS=("init-databases.sh" "start-services.sh" "seed-data.sh")
for script in "${REQUIRED_SCRIPTS[@]}"; do
    if [ -f "$SCRIPT_DIR/$script" ]; then
        if [ -x "$SCRIPT_DIR/$script" ]; then
            check_success "$script is executable"
        else
            check_error "$script exists but is not executable"
        fi
    else
        check_error "$script not found"
    fi
done

# Check 7: SQL initialization files
echo -e "\n${BLUE}Checking SQL files...${NC}"

REQUIRED_SQL=("01-auth_db.sql" "02-products_db.sql" "03-cart_db.sql" "04-inventory_db.sql")
for sql_file in "${REQUIRED_SQL[@]}"; do
    if [ -f "$SCRIPT_DIR/sql/$sql_file" ]; then
        check_success "$sql_file found"
    else
        check_error "$sql_file not found"
    fi
done

# Check 8: Port availability
echo -e "\n${BLUE}Checking port availability...${NC}"

PORTS=(5431 5432 5433 5434 6379 2181 9092 8080 8082 8083 8084 8085 9090 3000)
PORTS_IN_USE=0

for port in "${PORTS[@]}"; do
    if command -v lsof &> /dev/null; then
        if lsof -i :$port &> /dev/null; then
            check_warning "Port $port is already in use"
            ((PORTS_IN_USE++))
        fi
    fi
done

if [ $PORTS_IN_USE -eq 0 ]; then
    check_success "All required ports are available"
fi

# Check 9: Java installation
echo -e "\n${BLUE}Checking Java installation...${NC}"
if command -v java &> /dev/null; then
    JAVA_VERSION=$(java -version 2>&1 | head -1)
    check_success "Java installed: $JAVA_VERSION"
else
    check_warning "Java is not installed (required for building services from source)"
fi

# Check 10: Maven installation (optional)
echo -e "\n${BLUE}Checking Maven installation...${NC}"
if command -v mvn &> /dev/null; then
    MVN_VERSION=$(mvn -v 2>&1 | head -1)
    check_success "Maven installed: $MVN_VERSION"
else
    check_warning "Maven is not installed (optional, for building from source)"
fi

# Check 11: Disk space
echo -e "\n${BLUE}Checking available disk space...${NC}"
AVAILABLE_GB=$(df "$PROJECT_DIR" | tail -1 | awk '{print $4}' | xargs -I {} expr {} / 1024 / 1024)
if [ "$AVAILABLE_GB" -ge 10 ]; then
    check_success "Sufficient disk space: ${AVAILABLE_GB}GB available"
else
    check_warning "Limited disk space: ${AVAILABLE_GB}GB available (recommended: 10GB+)"
fi

# Check 12: Memory
echo -e "\n${BLUE}Checking available memory...${NC}"
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    AVAILABLE_MB=$(vm_stat | grep "Pages free" | awk '{print int($3 * 4096 / 1024 / 1024)}')
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    AVAILABLE_MB=$(free -m | awk 'NR==2{print $7}')
else
    AVAILABLE_MB=0
fi

if [ "$AVAILABLE_MB" -gt 4096 ]; then
    check_success "Sufficient available memory: ${AVAILABLE_MB}MB"
elif [ "$AVAILABLE_MB" -gt 0 ]; then
    check_warning "Limited available memory: ${AVAILABLE_MB}MB (recommended: 4GB+)"
fi

# Check 13: docker-compose.yml structure
echo -e "\n${BLUE}Checking docker-compose.yml structure...${NC}"

REQUIRED_SERVICES=("auth-db" "products-db" "cart-db" "inventory-db" "redis" "zookeeper" "kafka" "auth-service" "products-service" "cart-service" "inventory-service" "api-gateway")

if [ -f "$PROJECT_DIR/docker-compose.yml" ]; then
    for service in "${REQUIRED_SERVICES[@]}"; do
        if grep -q "^\s*$service:" "$PROJECT_DIR/docker-compose.yml"; then
            check_success "Service '$service' defined in docker-compose.yml"
        else
            check_warning "Service '$service' not found in docker-compose.yml"
        fi
    done
fi

# Final Summary
echo -e "\n${BLUE}=== Validation Summary ===${NC}"
echo -e "Errors:   ${RED}$ERRORS${NC}"
echo -e "Warnings: ${YELLOW}$WARNINGS${NC}"

if [ $ERRORS -eq 0 ]; then
    echo -e "\n${GREEN}✓ Setup is valid and ready to use!${NC}"
    echo -e "\n${BLUE}Next steps:${NC}"
    echo "1. Review and update .env file if needed"
    echo "2. Run: ./scripts/init-databases.sh"
    echo "3. Run: ./scripts/start-services.sh"
    echo "4. Check: docker-compose ps"
    exit 0
else
    echo -e "\n${RED}✗ Setup validation failed. Please fix the errors above.${NC}"
    exit 1
fi
