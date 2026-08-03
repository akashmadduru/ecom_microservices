#!/bin/bash

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load environment variables from .env
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

DB_CONTAINER="${DB_CONTAINER:-ecom-postgres}"
DB_ADMIN_USER="${DB_USER:-postgres}"
DB_ADMIN_PASSWORD="${DB_PASSWORD:-postgres}"

# Database-specific users and passwords
AUTH_DB_USER="${AUTH_DB_USER:-auth_user}"
AUTH_DB_PASSWORD="${AUTH_DB_PASSWORD:-auth_password}"

PRODUCTS_DB_USER="${PRODUCTS_DB_USER:-products_user}"
PRODUCTS_DB_PASSWORD="${PRODUCTS_DB_PASSWORD:-products_password}"

INVENTORY_DB_USER="${INVENTORY_DB_USER:-inventory_user}"
INVENTORY_DB_PASSWORD="${INVENTORY_DB_PASSWORD:-inventory_password}"

CART_DB_USER="${CART_DB_USER:-cart_user}"
CART_DB_PASSWORD="${CART_DB_PASSWORD:-cart_password}"

echo "📋 Using configuration:"
echo "   Container: $DB_CONTAINER"
echo "   Admin User: $DB_ADMIN_USER"
echo "   Script Dir: $SCRIPT_DIR"
echo ""

echo "🗑️  Terminating active connections..."
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN_USER" -d postgres -c "SELECT pg_terminate_backend(pg_stat_activity.pid) FROM pg_stat_activity WHERE pg_stat_activity.datname IN ('auth_db', 'products_db', 'inventory_db', 'cart_db') AND pid <> pg_backend_pid();" 2>/dev/null || true

echo "🗑️  Dropping existing databases..."
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN_USER" -d postgres -c "DROP DATABASE IF EXISTS auth_db;"
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN_USER" -d postgres -c "DROP DATABASE IF EXISTS products_db;"
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN_USER" -d postgres -c "DROP DATABASE IF EXISTS inventory_db;"
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN_USER" -d postgres -c "DROP DATABASE IF EXISTS cart_db;"

echo "🗑️  Dropping existing roles..."
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN_USER" -d postgres -c "DROP ROLE IF EXISTS $AUTH_DB_USER;"
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN_USER" -d postgres -c "DROP ROLE IF EXISTS $PRODUCTS_DB_USER;"
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN_USER" -d postgres -c "DROP ROLE IF EXISTS $INVENTORY_DB_USER;"
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN_USER" -d postgres -c "DROP ROLE IF EXISTS $CART_DB_USER;"

echo "✅ Databases and roles dropped."

echo "🔧 Creating databases and roles..."

# Create auth_db
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN_USER" -d postgres -c "CREATE ROLE $AUTH_DB_USER WITH LOGIN PASSWORD '$AUTH_DB_PASSWORD';"
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN_USER" -d postgres -c "CREATE DATABASE auth_db OWNER $AUTH_DB_USER;"
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN_USER" -d auth_db -c "GRANT ALL PRIVILEGES ON DATABASE auth_db TO $AUTH_DB_USER;"

# Create products_db
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN_USER" -d postgres -c "CREATE ROLE $PRODUCTS_DB_USER WITH LOGIN PASSWORD '$PRODUCTS_DB_PASSWORD';"
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN_USER" -d postgres -c "CREATE DATABASE products_db OWNER $PRODUCTS_DB_USER;"
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN_USER" -d products_db -c "GRANT ALL PRIVILEGES ON DATABASE products_db TO $PRODUCTS_DB_USER;"

# Create inventory_db
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN_USER" -d postgres -c "CREATE ROLE $INVENTORY_DB_USER WITH LOGIN PASSWORD '$INVENTORY_DB_PASSWORD';"
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN_USER" -d postgres -c "CREATE DATABASE inventory_db OWNER $INVENTORY_DB_USER;"
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN_USER" -d inventory_db -c "GRANT ALL PRIVILEGES ON DATABASE inventory_db TO $INVENTORY_DB_USER;"

# Create cart_db
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN_USER" -d postgres -c "CREATE ROLE $CART_DB_USER WITH LOGIN PASSWORD '$CART_DB_PASSWORD';"
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN_USER" -d postgres -c "CREATE DATABASE cart_db OWNER $CART_DB_USER;"
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN_USER" -d cart_db -c "GRANT ALL PRIVILEGES ON DATABASE cart_db TO $CART_DB_USER;"

echo "✅ Databases and roles created successfully."
echo ""

# Copy SQL files to container
docker cp "$SCRIPT_DIR/01_auth_schema.sql" "$DB_CONTAINER":/tmp/
docker cp "$SCRIPT_DIR/05_auth_data.sql" "$DB_CONTAINER":/tmp/
docker cp "$SCRIPT_DIR/02_products_schema.sql" "$DB_CONTAINER":/tmp/
docker cp "$SCRIPT_DIR/06_products_data.sql" "$DB_CONTAINER":/tmp/
docker cp "$SCRIPT_DIR/03_inventory_schema.sql" "$DB_CONTAINER":/tmp/
docker cp "$SCRIPT_DIR/07_inventory_data.sql" "$DB_CONTAINER":/tmp/
docker cp "$SCRIPT_DIR/04_cart_schema.sql" "$DB_CONTAINER":/tmp/
docker cp "$SCRIPT_DIR/08_cart_data.sql" "$DB_CONTAINER":/tmp/

# Load schemas and data
echo "📊 Loading schemas and data..."
echo ""

# Auth DB
echo "  🔨 Building auth_db schema..."
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN_USER" -d auth_db -f /tmp/01_auth_schema.sql > /dev/null 2>&1
echo "  ✅ auth_db schema loaded"

echo "  📝 Inserting auth data..."
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN_USER" -d auth_db -f /tmp/05_auth_data.sql > /dev/null 2>&1
echo "  ✅ auth data inserted"

# Products DB
echo "  🔨 Building products_db schema..."
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN_USER" -d products_db -f /tmp/02_products_schema.sql > /dev/null 2>&1
echo "  ✅ products_db schema loaded"

echo "  📝 Inserting products data..."
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN_USER" -d products_db -f /tmp/06_products_data.sql > /dev/null 2>&1
echo "  ✅ products data inserted"

# Inventory DB
echo "  🔨 Building inventory_db schema..."
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN_USER" -d inventory_db -f /tmp/03_inventory_schema.sql > /dev/null 2>&1
echo "  ✅ inventory_db schema loaded"

echo "  📝 Inserting inventory data..."
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN_USER" -d inventory_db -f /tmp/07_inventory_data.sql > /dev/null 2>&1
echo "  ✅ inventory data inserted"

# Cart DB
echo "  🔨 Building cart_db schema..."
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN_USER" -d cart_db -f /tmp/04_cart_schema.sql > /dev/null 2>&1
echo "  ✅ cart_db schema loaded"

echo "  📝 Inserting cart data..."
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN_USER" -d cart_db -f /tmp/08_cart_data.sql > /dev/null 2>&1
echo "  ✅ cart data inserted"

echo ""
echo "📊 Database Configuration:"
echo "   auth_db        | User: $AUTH_DB_USER"
echo "   products_db    | User: $PRODUCTS_DB_USER"
echo "   inventory_db   | User: $INVENTORY_DB_USER"
echo "   cart_db        | User: $CART_DB_USER"
echo ""
echo "🎉 Database initialization complete!"
