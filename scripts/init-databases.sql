-- Create separate databases for each service
CREATE DATABASE ecommerce_auth OWNER ecom_user;
CREATE DATABASE ecommerce_product OWNER ecom_user;
CREATE DATABASE ecommerce_inventory OWNER ecom_user;

-- Connect to each database and enable extensions
\c ecommerce_product ecom_user
CREATE EXTENSION IF NOT EXISTS ltree;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

\c ecommerce_inventory ecom_user
CREATE EXTENSION IF NOT EXISTS ltree;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

\c ecommerce_auth ecom_user
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE ecommerce_auth TO ecom_user;
GRANT ALL PRIVILEGES ON DATABASE ecommerce_product TO ecom_user;
GRANT ALL PRIVILEGES ON DATABASE ecommerce_inventory TO ecom_user;
