#!/bin/bash

# E-commerce Microservices - Database Initialization Script
# This script initializes all PostgreSQL databases with schemas and sample data

set -euo pipefail

# Colors for output
SET RED='\033[0;31m'
SET GREEN='\033[0;32m'
SET YELLOW='\033[1;33m'
SET BLUE='\033[0;34m'
SET NC='\033[0m' # No Color

# Configuration
SET SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SET PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SET DOCKER_COMPOSE_FILE="$PROJECT_DIR/docker-compose.yml"
SET SQL_DIR="$SCRIPT_DIR/sql"

# Load environment variables
if [ -f "$PROJECT_DIR/.env" ]; then
    export $(cat "$PROJECT_DIR/.env" | xargs)
else
    echo -e "${YELLOW}Warning: .env file not found. Using defaults.${NC}"
fi

SET DB_USER="${DB_USER:-postgres}"
SET DB_PASSWORD="${DB_PASSWORD:-postgres}"
SET DB_HOST="${DB_HOST:-localhost}"

# Database connection parameters
SET DATABASES=("auth_db" "products_db" "cart_db" "inventory_db")
SET DB_PORTS=("5431" "5432" "5433" "5434")
SET SQL_FILES=("01-auth_db.sql" "02-products_db.sql" "03-cart_db.sql" "04-inventory_db.sql")

echo -e "${BLUE}=== E-commerce Microservices Database Initialization ===${NC}\n"

# Function to check if database is ready
check_db_ready() {
    local port=$1
    local db_name=$2

    echo -n "Waiting for $db_name to be ready on port $port... "

    for attempt in {1..30}; do
        if pg_isready -h "$DB_HOST" -p "$port" -U "$DB_USER" &> /dev/null; then
            echo -e "${GREEN}Ready!${NC}"
            return 0
        fi
        echo -n "."
        sleep 1
    done

    echo -e "${RED}Failed!${NC}"
    return 1
}

# Function to initialize a database
init_database() {
    local db_name=$1
    local port=$2
    local sql_file=$3

    echo -e "\n${BLUE}Initializing $db_name...${NC}"

    if ! check_db_ready "$port" "$db_name"; then
        echo -e "${RED}Error: $db_name is not ready. Skipping initialization.${NC}"
        return 1
    fi

    if [ ! -f "$SQL_DIR/$sql_file" ]; then
        echo -e "${RED}Error: SQL file not found: $SQL_DIR/$sql_file${NC}"
        return 1
    fi

    # Execute the SQL file
    export PGPASSWORD="$DB_PASSWORD"
    psql -h "$DB_HOST" -U "$DB_USER" -p "$port" -d "$db_name" -f "$SQL_DIR/$sql_file" 2>&1
    unset PGPASSWORD

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ $db_name initialized successfully${NC}"
        return 0
    else
        echo -e "${RED}✗ Failed to initialize $db_name${NC}"
        return 1
    fi
}

# Main initialization process
main() {
    # Check if Docker Compose is installed
    if ! command -v docker-compose &> /dev/null && ! command -v docker compose &> /dev/null; then
        echo -e "${RED}Error: docker-compose is not installed${NC}"
        exit 1
    fi

    # Check if docker is running
    if ! docker info &> /dev/null; then
        echo -e "${RED}Error: Docker daemon is not running${NC}"
        exit 1
    fi

    # Check for PostgreSQL client tools
    if ! command -v pg_isready &> /dev/null; then
        echo -e "${YELLOW}Warning: pg_isready not found. Some checks may fail.${NC}"
    fi

    if ! command -v psql &> /dev/null; then
        echo -e "${RED}Error: psql (PostgreSQL client) is not installed. Cannot initialize databases.${NC}"
        echo "Install PostgreSQL client tools to continue."
        exit 1
    fi

    # Start Docker containers
    echo -e "${BLUE}Starting Docker containers...${NC}"
    cd "$PROJECT_DIR"

    if docker-compose ps 2>/dev/null | grep -q "postgres\|auth-db\|products-db\|cart-db\|inventory-db"; then
        echo -e "${YELLOW}Docker containers already running. Skipping docker-compose up.${NC}"
    else
        echo "Pulling latest images and starting containers..."
        docker-compose up -d postgres:15-alpine auth-db products-db cart-db inventory-db 2>/dev/null || \
        docker-compose up -d 2>/dev/null || {
            echo -e "${RED}Error: Failed to start Docker containers${NC}"
            exit 1
        }
    fi

    echo -e "\n${BLUE}Initializing databases...${NC}"

    # Initialize each database
    failed=0
    for i in "${!DATABASES[@]}"; do
        init_database "${DATABASES[$i]}" "${DB_PORTS[$i]}" "${SQL_FILES[$i]}" || ((failed++))
    done

    # Summary
    echo -e "\n${BLUE}=== Initialization Summary ===${NC}"

    if [ $failed -eq 0 ]; then
        echo -e "${GREEN}✓ All databases initialized successfully!${NC}"
        echo -e "\n${BLUE}Database Connection Details:${NC}"
        echo "Auth DB:      $DB_HOST:5431"
        echo "Products DB:  $DB_HOST:5432"
        echo "Cart DB:      $DB_HOST:5433"
        echo "Inventory DB: $DB_HOST:5434"
        echo -e "\n${BLUE}Default Credentials:${NC}"
        echo "Username: $DB_USER"
        echo "Password: ******* (from .env or environment)"
        return 0
    else
        echo -e "${RED}✗ Failed to initialize $failed database(s)${NC}"
        return 1
    fi
}

# Run main function
main "$@"
