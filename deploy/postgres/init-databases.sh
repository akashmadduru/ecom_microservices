#!/bin/bash
# Creates one database + owner role per service.
# The isolation that matters is logical: separate DBs, separate credentials,
# no cross-DB grants. Kubernetes points each service at its own instance instead.
#
# Per-service passwords come from env vars (falling back to the historical
# dev-only password-equals-username default) so they're overridable per
# environment — via docker-compose.yml, Kubernetes secrets, or a secret
# manager — instead of being hardcoded in this script.
set -e

create_db() {
    local db="$1" user="$2" pass="$3"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
        DO \$\$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$user') THEN
                CREATE ROLE $user LOGIN PASSWORD '$pass';
            END IF;
        END
        \$\$;
        CREATE DATABASE $db OWNER $user;
        GRANT ALL PRIVILEGES ON DATABASE $db TO $user;
EOSQL
}

create_db auth_db auth_user "${AUTH_DB_PASSWORD:-auth_user}"
create_db user_db user_user "${USER_DB_PASSWORD:-user_user}"
create_db product_db product_user "${PRODUCT_DB_PASSWORD:-product_user}"
create_db inventory_db inventory_user "${INVENTORY_DB_PASSWORD:-inventory_user}"
create_db cart_db cart_user "${CART_DB_PASSWORD:-cart_user}"
create_db wishlist_db wishlist_user "${WISHLIST_DB_PASSWORD:-wishlist_user}"
create_db order_db order_user "${ORDER_DB_PASSWORD:-order_user}"
create_db payment_db payment_user "${PAYMENT_DB_PASSWORD:-payment_user}"
create_db notification_db notification_user "${NOTIFICATION_DB_PASSWORD:-notification_user}"
create_db search_db search_user "${SEARCH_DB_PASSWORD:-search_user}"
create_db review_db review_user "${REVIEW_DB_PASSWORD:-review_user}"

# pg_trgm for the search service's suggestion queries
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" -d search_db <<-EOSQL
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
EOSQL
