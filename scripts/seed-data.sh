#!/bin/bash

# E-commerce Microservices - Seed Data Script
# Adds additional test data to all databases

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

# Load environment variables
if [ -f "$PROJECT_DIR/.env" ]; then
    export $(cat "$PROJECT_DIR/.env" | xargs)
fi

DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-postgres}"
DB_HOST="${DB_HOST:-localhost}"

echo -e "${BLUE}=== E-commerce Microservices - Seed Data ===${NC}\n"

# Function to execute SQL on a database
run_sql() {
    local db_name=$1
    local port=$2
    local sql_command=$3

    export PGPASSWORD="$DB_PASSWORD"
    echo "$sql_command" | psql -h "$DB_HOST" -U "$DB_USER" -p "$port" -d "$db_name" 2>&1
    unset PGPASSWORD
}

# Seed auth_db with additional users
seed_auth_db() {
    echo -e "${BLUE}Seeding auth_db...${NC}"

    local sql="
    INSERT INTO users (username, email, password_hash, role, provider, is_active)
    VALUES
        ('customer1', 'customer1@ecom.local', '\$2a\$10\$slYQmyNdGzin7olVN3DONuPaHnm.qzHqKKmM6U4OqKOPAb/wZLqWK', 'USER', 'local', true),
        ('customer2', 'customer2@ecom.local', '\$2a\$10\$slYQmyNdGzin7olVN3DONuPaHnm.qzHqKKmM6U4OqKOPAb/wZLqWK', 'USER', 'local', true),
        ('customer3', 'customer3@ecom.local', '\$2a\$10\$slYQmyNdGzin7olVN3DONuPaHnm.qzHqKKmM6U4OqKOPAb/wZLqWK', 'USER', 'local', true),
        ('seller2', 'seller2@ecom.local', '\$2a\$10\$slYQmyNdGzin7olVN3DONuPaHnm.qzHqKKmM6U4OqKOPAb/wZLqWK', 'SELLER', 'local', true)
    ON CONFLICT (username) DO NOTHING;
    "

    run_sql "auth_db" "5431" "$sql"
    echo -e "${GREEN}✓ auth_db seeded${NC}"
}

# Seed products_db with additional products
seed_products_db() {
    echo -e "${BLUE}Seeding products_db...${NC}"

    local sql="
    INSERT INTO products (name, description, price, stock)
    VALUES
        ('Desk Lamp', 'LED desk lamp with adjustable brightness', 44.99, 55),
        ('Mouse Pad', 'Large gaming mouse pad with non-slip base', 24.99, 120),
        ('HDMI Cable', '4K HDMI 2.1 cable, 6ft', 29.99, 80),
        ('Cooling Pad', 'Laptop cooling pad with dual fans', 34.99, 45),
        ('USB Mouse', 'Wireless USB mouse with extended range', 34.99, 90),
        ('Notebook', 'Premium hardcover notebook, 200 pages', 19.99, 200),
        ('Desktop Mic', 'Condenser microphone for streaming', 199.99, 20),
        ('Cable Organizer', 'Cable management set for desk organization', 14.99, 150),
        ('Phone Mount', 'Adjustable phone holder for desk', 16.99, 110),
        ('Desk Organizer', 'Multi-compartment desk storage organizer', 39.99, 60),
        ('Gaming Chair', 'Ergonomic gaming chair with lumbar support', 299.99, 15),
        ('Monitor Arm', 'Adjustable dual monitor arm mount', 89.99, 25),
        ('USB-A to USB-C Adapter', 'High-speed adapter for legacy devices', 9.99, 250),
        ('Phone Charger', 'Fast charging 65W USB-C charger', 59.99, 75),
        ('Desk Pad', 'Large non-slip desk mat, PU leather', 54.99, 40)
    ON CONFLICT DO NOTHING;
    "

    run_sql "products_db" "5432" "$sql"
    echo -e "${GREEN}✓ products_db seeded${NC}"
}

# Seed cart_db with additional carts
seed_cart_db() {
    echo -e "${BLUE}Seeding cart_db...${NC}"

    local sql="
    INSERT INTO carts (user_id)
    VALUES
        ('550e8400-e29b-41d4-a716-446655440004'),
        ('550e8400-e29b-41d4-a716-446655440005'),
        ('550e8400-e29b-41d4-a716-446655440006')
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO cart_items (cart_id, product_id, quantity, price)
    SELECT
        c.id,
        p.id,
        FLOOR(RANDOM() * 5 + 1)::INT,
        p.price
    FROM carts c
    CROSS JOIN LATERAL (
        SELECT id, price FROM products ORDER BY RANDOM() LIMIT 2
    ) p
    WHERE c.user_id IN (
        '550e8400-e29b-41d4-a716-446655440002',
        '550e8400-e29b-41d4-a716-446655440003',
        '550e8400-e29b-41d4-a716-446655440004',
        '550e8400-e29b-41d4-a716-446655440005',
        '550e8400-e29b-41d4-a716-446655440006'
    )
    ON CONFLICT DO NOTHING;
    "

    run_sql "cart_db" "5433" "$sql"
    echo -e "${GREEN}✓ cart_db seeded${NC}"
}

# Seed inventory_db with additional inventory records
seed_inventory_db() {
    echo -e "${BLUE}Seeding inventory_db...${NC}"

    local sql="
    INSERT INTO inventory (product_id, available_stock, reserved_stock, last_updated)
    SELECT
        id,
        FLOOR(RANDOM() * 100 + 30)::INT,
        FLOOR(RANDOM() * 15)::INT,
        CURRENT_TIMESTAMP
    FROM (
        SELECT id FROM (VALUES (11), (12), (13), (14), (15), (16), (17), (18), (19), (20), (21), (22), (23), (24), (25)) AS t(id)
    ) sub
    ON CONFLICT (product_id) DO NOTHING;

    INSERT INTO reservations (product_id, user_id, quantity, reserved_at, expires_at, is_released)
    VALUES
        (2, '550e8400-e29b-41d4-a716-446655440002', 1, CURRENT_TIMESTAMP - INTERVAL '5 days', CURRENT_TIMESTAMP - INTERVAL '4 days', true),
        (3, '550e8400-e29b-41d4-a716-446655440003', 2, CURRENT_TIMESTAMP + INTERVAL '1 hour', CURRENT_TIMESTAMP + INTERVAL '25 hours', false),
        (5, '550e8400-e29b-41d4-a716-446655440004', 1, CURRENT_TIMESTAMP + INTERVAL '2 hours', CURRENT_TIMESTAMP + INTERVAL '26 hours', false)
    ON CONFLICT DO NOTHING;
    "

    run_sql "inventory_db" "5434" "$sql"
    echo -e "${GREEN}✓ inventory_db seeded${NC}"
}

# Function to verify data
verify_data() {
    echo -e "\n${BLUE}=== Data Verification ===${NC}\n"

    echo -e "${BLUE}Users:${NC}"
    run_sql "auth_db" "5431" "SELECT COUNT(*) as user_count FROM users;"

    echo -e "\n${BLUE}Products:${NC}"
    run_sql "products_db" "5432" "SELECT COUNT(*) as product_count FROM products;"

    echo -e "\n${BLUE}Carts:${NC}"
    run_sql "cart_db" "5433" "SELECT COUNT(*) as cart_count FROM carts; SELECT COUNT(*) as cart_item_count FROM cart_items;"

    echo -e "\n${BLUE}Inventory:${NC}"
    run_sql "inventory_db" "5434" "SELECT COUNT(*) as inventory_count FROM inventory; SELECT COUNT(*) as reservation_count FROM reservations;"
}

# Main seeding process
main() {
    # Check if databases are accessible
    echo -e "${BLUE}Checking database connectivity...${NC}"

    export PGPASSWORD="$DB_PASSWORD"
    if ! pg_isready -h "$DB_HOST" -p 5431 -U "$DB_USER" &> /dev/null; then
        echo -e "${RED}Error: Cannot connect to auth_db${NC}"
        exit 1
    fi
    unset PGPASSWORD

    # Seed each database
    seed_auth_db
    seed_products_db
    seed_cart_db
    seed_inventory_db

    # Verify data
    verify_data

    echo -e "\n${GREEN}✓ All databases seeded successfully!${NC}\n"
}

# Run main function
main "$@"
