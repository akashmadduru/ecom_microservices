-- Cart DB Initialization Script
-- Creates carts and cart_items tables with sample data

CREATE TABLE IF NOT EXISTS carts (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS cart_items (
    id BIGSERIAL PRIMARY KEY,
    cart_id BIGINT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    price NUMERIC(10, 2) NOT NULL,
    added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_carts_user_id ON carts(user_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_product_id ON cart_items(product_id);

-- Sample cart data
-- Note: User IDs should correspond to UUIDs from auth_db users table
-- Using sample UUIDs for demonstration
INSERT INTO carts (user_id)
VALUES
    ('550e8400-e29b-41d4-a716-446655440001'),
    ('550e8400-e29b-41d4-a716-446655440002'),
    ('550e8400-e29b-41d4-a716-446655440003')
ON CONFLICT (user_id) DO NOTHING;

-- Sample cart items
-- First get the cart IDs and product IDs
INSERT INTO cart_items (cart_id, product_id, quantity, price)
SELECT
    c.id,
    p.id,
    FLOOR(RANDOM() * 3 + 1)::INT,
    p.price
FROM carts c
CROSS JOIN LATERAL (
    SELECT id, price FROM products ORDER BY RANDOM() LIMIT 3
) p
WHERE c.user_id = '550e8400-e29b-41d4-a716-446655440001'
ON CONFLICT DO NOTHING;
