-- Cart Database Sample Data
-- Note: product_id values are references to products_db (not foreign keys)
-- Product UUIDs from products_db:
-- LAPTOP-001: d56e2ef7-66ba-40c9-a4e9-c81595f614f1
-- LAPTOP-002: e50c650f-db22-4a9c-8006-d11e7fcf8bd4
-- LAPTOP-004: e9573852-a6b0-4891-b399-fafc1f32b6e0
-- PHONE-002: e181ea08-b83f-4231-83f3-22a31b29d448
-- CLOTH-001: 0e09e84a-3a10-4831-8d5b-bc6a8011b902
-- CLOTH-002: 756e763f-5c23-4300-9e08-555f3aa23358
-- CLOTH-003: 324d0524-f80e-492d-a89b-89ee53a8d6cf

-- Insert shopping carts
INSERT INTO shopping_carts (user_id, total_price, total_items, is_active) VALUES
('550e8400-e29b-41d4-a716-446655440000', 2099.98, 2, TRUE),
('550e8400-e29b-41d4-a716-446655440001', 1299.99, 1, TRUE),
('550e8400-e29b-41d4-a716-446655440002', 129.98, 2, FALSE);

-- Insert cart items
INSERT INTO cart_items (cart_id, product_id, quantity, unit_price, discount_amount, total_price) VALUES
((SELECT id FROM shopping_carts WHERE user_id = '550e8400-e29b-41d4-a716-446655440000'), 'e50c650f-db22-4a9c-8006-d11e7fcf8bd4', 1, 1199.99, 0, 1199.99),
((SELECT id FROM shopping_carts WHERE user_id = '550e8400-e29b-41d4-a716-446655440000'), '0e09e84a-3a10-4831-8d5b-bc6a8011b902', 3, 29.99, 9.99, 79.98),
((SELECT id FROM shopping_carts WHERE user_id = '550e8400-e29b-41d4-a716-446655440001'), 'e181ea08-b83f-4231-83f3-22a31b29d448', 1, 799.99, 0, 799.99),
((SELECT id FROM shopping_carts WHERE user_id = '550e8400-e29b-41d4-a716-446655440002'), '756e763f-5c23-4300-9e08-555f3aa23358', 1, 79.99, 12, 67.99),
((SELECT id FROM shopping_carts WHERE user_id = '550e8400-e29b-41d4-a716-446655440002'), '0e09e84a-3a10-4831-8d5b-bc6a8011b902', 1, 29.99, 0, 61.99);

-- Insert orders
INSERT INTO orders (order_number, user_id, status, subtotal, tax, shipping_cost, discount_amount, total_amount, payment_method, payment_status, shipping_address, billing_address, notes) VALUES
('ORD-2024-001', '550e8400-e29b-41d4-a716-446655440000', 'confirmed', 1999.97, 159.98, 10.00, 0, 2169.95, 'credit_card', 'completed', '123 Main St, New York, NY 10001', '123 Main St, New York, NY 10001', 'Gift wrapping requested'),
('ORD-2024-002', '550e8400-e29b-41d4-a716-446655440001', 'shipped', 799.99, 64.00, 15.00, 80.00, 798.99, 'credit_card', 'completed', '456 Oak Ave, Los Angeles, CA 90001', '456 Oak Ave, Los Angeles, CA 90001', NULL),
('ORD-2024-003', '550e8400-e29b-41d4-a716-446655440002', 'processing', 2199.99, 175.99, 20.00, 50.00, 2345.98, 'paypal', 'pending', '789 Pine Road, Chicago, IL 60601', NULL, 'Express shipping requested'),
('ORD-2024-004', '550e8400-e29b-41d4-a716-446655440000', 'delivered', 499.99, 40.00, 5.00, 0, 544.99, 'credit_card', 'completed', '321 Elm Street, Miami, FL 33101', '321 Elm Street, Miami, FL 33101', NULL),
('ORD-2024-005', '550e8400-e29b-41d4-a716-446655440001', 'pending', 1599.99, 128.00, 10.00, 0, 1737.99, 'credit_card', 'pending', '654 Maple Dr, Seattle, WA 98101', NULL, 'Customer requested signature on delivery');

-- Insert order items
INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, discount_amount, total_price) VALUES
((SELECT id FROM orders WHERE order_number = 'ORD-2024-001'), 'e50c650f-db22-4a9c-8006-d11e7fcf8bd4', 'Dell XPS 13', 1, 1199.99, 0, 1199.99),
((SELECT id FROM orders WHERE order_number = 'ORD-2024-001'), '0e09e84a-3a10-4831-8d5b-bc6a8011b902', 'Premium Cotton T-Shirt', 4, 29.99, 19.98, 100.00),
((SELECT id FROM orders WHERE order_number = 'ORD-2024-002'), 'e181ea08-b83f-4231-83f3-22a31b29d448', 'Samsung Galaxy S24', 1, 799.99, 0, 799.99),
((SELECT id FROM orders WHERE order_number = 'ORD-2024-003'), 'd56e2ef7-66ba-40c9-a4e9-c81595f614f1', 'MacBook Pro 16"', 1, 2199.99, 0, 2199.99),
((SELECT id FROM orders WHERE order_number = 'ORD-2024-004'), '324d0524-f80e-492d-a89b-89ee53a8d6cf', 'Winter Jacket', 1, 199.99, 0, 199.99),
((SELECT id FROM orders WHERE order_number = 'ORD-2024-004'), '756e763f-5c23-4300-9e08-555f3aa23358', 'Slim Fit Jeans', 1, 79.99, 0, 79.99),
((SELECT id FROM orders WHERE order_number = 'ORD-2024-004'), '0e09e84a-3a10-4831-8d5b-bc6a8011b902', 'Premium Cotton T-Shirt', 2, 29.99, 0, 59.98),
((SELECT id FROM orders WHERE order_number = 'ORD-2024-005'), 'e9573852-a6b0-4891-b399-fafc1f32b6e0', 'Lenovo ThinkPad X1', 1, 1599.99, 0, 1599.99);

-- Insert order shipments
INSERT INTO order_shipments (order_id, tracking_number, carrier, status, shipped_at, delivered_at, estimated_delivery_date, actual_delivery_date, shipping_address) VALUES
((SELECT id FROM orders WHERE order_number = 'ORD-2024-001'), 'TRACK123456', 'FedEx', 'delivered', NOW() - INTERVAL '10 days', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days', '123 Main St, New York, NY 10001'),
((SELECT id FROM orders WHERE order_number = 'ORD-2024-002'), 'TRACK234567', 'UPS', 'in_transit', NOW() - INTERVAL '3 days', NULL, NOW() + INTERVAL '1 day', NULL, '456 Oak Ave, Los Angeles, CA 90001'),
((SELECT id FROM orders WHERE order_number = 'ORD-2024-003'), NULL, NULL, 'pending', NULL, NULL, NOW() + INTERVAL '3 days', NULL, '789 Pine Road, Chicago, IL 60601'),
((SELECT id FROM orders WHERE order_number = 'ORD-2024-004'), 'TRACK345678', 'USPS', 'delivered', NOW() - INTERVAL '30 days', NOW() - INTERVAL '25 days', NOW() - INTERVAL '25 days', NOW() - INTERVAL '25 days', '321 Elm Street, Miami, FL 33101'),
((SELECT id FROM orders WHERE order_number = 'ORD-2024-005'), NULL, NULL, 'pending', NULL, NULL, NOW() + INTERVAL '2 days', NULL, '654 Maple Dr, Seattle, WA 98101');

-- Insert order history
INSERT INTO order_history (order_id, status_from, status_to, notes, changed_by) VALUES
((SELECT id FROM orders WHERE order_number = 'ORD-2024-001'), 'pending', 'confirmed', 'Payment confirmed', 'system'),
((SELECT id FROM orders WHERE order_number = 'ORD-2024-001'), 'confirmed', 'shipped', 'Order shipped', 'warehouse_staff'),
((SELECT id FROM orders WHERE order_number = 'ORD-2024-001'), 'shipped', 'delivered', 'Delivery confirmed', 'system'),
((SELECT id FROM orders WHERE order_number = 'ORD-2024-002'), 'pending', 'confirmed', 'Payment confirmed', 'system'),
((SELECT id FROM orders WHERE order_number = 'ORD-2024-002'), 'confirmed', 'shipped', 'Order shipped', 'warehouse_staff'),
((SELECT id FROM orders WHERE order_number = 'ORD-2024-003'), 'pending', 'processing', 'Processing order', 'warehouse_staff'),
((SELECT id FROM orders WHERE order_number = 'ORD-2024-004'), 'pending', 'confirmed', 'Payment confirmed', 'system'),
((SELECT id FROM orders WHERE order_number = 'ORD-2024-004'), 'confirmed', 'shipped', 'Order shipped', 'warehouse_staff'),
((SELECT id FROM orders WHERE order_number = 'ORD-2024-004'), 'shipped', 'delivered', 'Delivery confirmed', 'system'),
((SELECT id FROM orders WHERE order_number = 'ORD-2024-005'), 'pending', 'pending', 'Order received, awaiting payment', 'system');
