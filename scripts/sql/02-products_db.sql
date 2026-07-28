-- Products DB Initialization Script
-- Creates products table with sample data

CREATE TABLE IF NOT EXISTS products (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price NUMERIC(10, 2) NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);

-- Sample product data
INSERT INTO products (name, description, price, stock)
VALUES
    ('Wireless Headphones', 'High-quality Bluetooth headphones with noise cancellation', 99.99, 50),
    ('USB-C Cable', 'Fast charging and data transfer cable, 6ft length', 19.99, 150),
    ('Phone Case', 'Durable protective case with shock absorption', 29.99, 80),
    ('Screen Protector Pack', 'Tempered glass screen protectors (3-pack)', 14.99, 200),
    ('Portable Charger', '20000mAh portable power bank with dual USB ports', 49.99, 60),
    ('Laptop Stand', 'Adjustable aluminum laptop stand for desk', 39.99, 40),
    ('Mechanical Keyboard', 'RGB mechanical keyboard with cherry switches', 149.99, 35),
    ('4K Webcam', 'Ultra HD webcam for streaming and video calls', 129.99, 25),
    ('USB Hub', '7-port USB 3.0 hub with power adapter', 34.99, 70),
    ('Monitor Light Bar', 'Auto-adjusting monitor light bar for eye care', 79.99, 30)
ON CONFLICT DO NOTHING;
