-- Inventory DB Initialization Script
-- Creates inventory and reservations tables with sample data

CREATE TABLE IF NOT EXISTS inventory (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL UNIQUE,
    available_stock INTEGER NOT NULL DEFAULT 0,
    reserved_stock INTEGER NOT NULL DEFAULT 0,
    last_updated TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reservations (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL,
    reserved_at TIMESTAMP NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    is_released BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_reservations_product_id ON reservations(product_id);
CREATE INDEX IF NOT EXISTS idx_reservations_user_id ON reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_reservations_is_released ON reservations(is_released);

-- Sample inventory data
-- Corresponds to the 10 products created in products_db
INSERT INTO inventory (product_id, available_stock, reserved_stock, last_updated)
SELECT
    id,
    FLOOR(RANDOM() * 50 + 20)::INT,
    FLOOR(RANDOM() * 10)::INT,
    CURRENT_TIMESTAMP
FROM (
    SELECT id FROM (VALUES (1), (2), (3), (4), (5), (6), (7), (8), (9), (10)) AS t(id)
) sub
ON CONFLICT (product_id) DO NOTHING;

-- Sample reservation data (expired reservations)
INSERT INTO reservations (product_id, user_id, quantity, reserved_at, expires_at, is_released)
VALUES
    (1, '550e8400-e29b-41d4-a716-446655440001', 2, CURRENT_TIMESTAMP - INTERVAL '2 days', CURRENT_TIMESTAMP - INTERVAL '1 day', true),
    (2, '550e8400-e29b-41d4-a716-446655440002', 1, CURRENT_TIMESTAMP - INTERVAL '3 days', CURRENT_TIMESTAMP - INTERVAL '2 days', true)
ON CONFLICT DO NOTHING;
