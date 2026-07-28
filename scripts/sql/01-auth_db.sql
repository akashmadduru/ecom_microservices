-- Auth DB Initialization Script
-- Creates users table with sample data

CREATE TABLE IF NOT EXISTS users (
    id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),
    role VARCHAR(30) NOT NULL DEFAULT 'USER',
    provider VARCHAR(30) NOT NULL DEFAULT 'local',
    provider_sub VARCHAR(255) UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for query optimization
CREATE INDEX IF NOT EXISTS idx_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_provider ON users(provider);
CREATE INDEX IF NOT EXISTS idx_provider_sub ON users(provider_sub);
CREATE INDEX IF NOT EXISTS idx_is_active ON users(is_active);

-- Sample data for testing
-- Password hashes are bcrypt hashes of "password123"
INSERT INTO users (username, email, password_hash, role, provider, is_active)
VALUES
    ('admin_user', 'admin@ecom.local', '$2a$10$slYQmyNdGzin7olVN3DONuPaHnm.qzHqKKmM6U4OqKOPAb/wZLqWK', 'ADMIN', 'local', true),
    ('test_user', 'user@ecom.local', '$2a$10$slYQmyNdGzin7olVN3DONuPaHnm.qzHqKKmM6U4OqKOPAb/wZLqWK', 'USER', 'local', true),
    ('seller_user', 'seller@ecom.local', '$2a$10$slYQmyNdGzin7olVN3DONuPaHnm.qzHqKKmM6U4OqKOPAb/wZLqWK', 'SELLER', 'local', true)
ON CONFLICT (username) DO NOTHING;
