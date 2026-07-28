-- Create databases for each microservice
CREATE DATABASE ecom_auth;
CREATE DATABASE ecom_product;
CREATE DATABASE ecom_inventory;

-- Grant privileges to ecom_user
GRANT ALL PRIVILEGES ON DATABASE ecom_auth TO ecom_user;
GRANT ALL PRIVILEGES ON DATABASE ecom_product TO ecom_user;
GRANT ALL PRIVILEGES ON DATABASE ecom_inventory TO ecom_user;

-- Connect to ecom_auth and grant schema privileges
\c ecom_auth
GRANT ALL ON SCHEMA public TO ecom_user;

-- Connect to ecom_product and grant schema privileges
\c ecom_product
GRANT ALL ON SCHEMA public TO ecom_user;

-- Connect to ecom_inventory and grant schema privileges
\c ecom_inventory
GRANT ALL ON SCHEMA public TO ecom_user;
