-- Inventory Database Sample Data
-- Note: product_id values are references to products_db (not foreign keys)

-- Insert warehouses
INSERT INTO warehouses (name, location, manager_name, manager_email, phone, address, city, state, postal_code, country, is_active) VALUES
('Main Warehouse', 'Downtown', 'John Smith', 'john.warehouse@ecom.local', '+1-555-0101', '123 Main Street', 'New York', 'NY', '10001', 'USA', TRUE),
('West Coast Hub', 'West Coast', 'Sarah Johnson', 'sarah.warehouse@ecom.local', '+1-555-0102', '456 Pacific Ave', 'Los Angeles', 'CA', '90001', 'USA', TRUE),
('East Coast Hub', 'East Coast', 'Mike Davis', 'mike.warehouse@ecom.local', '+1-555-0103', '789 Atlantic Blvd', 'Miami', 'FL', '33101', 'USA', TRUE),
('Central Distribution', 'Midwest', 'Lisa Anderson', 'lisa.warehouse@ecom.local', '+1-555-0104', '321 Central Ave', 'Chicago', 'IL', '60601', 'USA', TRUE);

-- Insert warehouse IDs for reference
-- Note: These UUIDs match products from products_db
-- Product SKUs and their UUIDs (generated in products_db):
-- LAPTOP-001: d56e2ef7-66ba-40c9-a4e9-c81595f614f1
-- LAPTOP-002: e50c650f-db22-4a9c-8006-d11e7fcf8bd4
-- LAPTOP-003: 89a3a289-f1c3-4d5a-a322-1fec34c606ed
-- LAPTOP-004: e9573852-a6b0-4891-b399-fafc1f32b6e0
-- PHONE-001: c4bcd8ae-e9b1-4e04-9fa6-819a6b446e93
-- PHONE-002: e181ea08-b83f-4231-83f3-22a31b29d448
-- PHONE-003: c1319b40-27b3-4d4c-9b90-fd1ad6bdf5b5
-- PHONE-004: 349d71f3-10a8-4bda-958b-842b320e415c
-- CLOTH-001: 0e09e84a-3a10-4831-8d5b-bc6a8011b902
-- CLOTH-002: 756e763f-5c23-4300-9e08-555f3aa23358
-- CLOTH-003: 324d0524-f80e-492d-a89b-89ee53a8d6cf

-- Insert stock for laptops in main warehouse
INSERT INTO stock (product_id, warehouse_id, quantity_available, quantity_reserved, quantity_damaged, reorder_level, reorder_quantity) VALUES
('d56e2ef7-66ba-40c9-a4e9-c81595f614f1', (SELECT id FROM warehouses WHERE name = 'Main Warehouse'), 45, 8, 0, 10, 25),
('e50c650f-db22-4a9c-8006-d11e7fcf8bd4', (SELECT id FROM warehouses WHERE name = 'Main Warehouse'), 32, 5, 1, 10, 20),
('89a3a289-f1c3-4d5a-a322-1fec34c606ed', (SELECT id FROM warehouses WHERE name = 'Main Warehouse'), 28, 3, 0, 15, 30),
('e9573852-a6b0-4891-b399-fafc1f32b6e0', (SELECT id FROM warehouses WHERE name = 'Main Warehouse'), 19, 2, 0, 10, 20);

-- Insert stock for laptops in west coast
INSERT INTO stock (product_id, warehouse_id, quantity_available, quantity_reserved, quantity_damaged, reorder_level, reorder_quantity) VALUES
('d56e2ef7-66ba-40c9-a4e9-c81595f614f1', (SELECT id FROM warehouses WHERE name = 'West Coast Hub'), 38, 6, 0, 10, 25),
('e50c650f-db22-4a9c-8006-d11e7fcf8bd4', (SELECT id FROM warehouses WHERE name = 'West Coast Hub'), 25, 4, 0, 10, 20),
('89a3a289-f1c3-4d5a-a322-1fec34c606ed', (SELECT id FROM warehouses WHERE name = 'West Coast Hub'), 42, 7, 2, 15, 30),
('e9573852-a6b0-4891-b399-fafc1f32b6e0', (SELECT id FROM warehouses WHERE name = 'West Coast Hub'), 21, 3, 0, 10, 20);

-- Insert stock for phones in main warehouse
INSERT INTO stock (product_id, warehouse_id, quantity_available, quantity_reserved, quantity_damaged, reorder_level, reorder_quantity) VALUES
('c4bcd8ae-e9b1-4e04-9fa6-819a6b446e93', (SELECT id FROM warehouses WHERE name = 'Main Warehouse'), 156, 25, 2, 20, 50),
('e181ea08-b83f-4231-83f3-22a31b29d448', (SELECT id FROM warehouses WHERE name = 'Main Warehouse'), 98, 15, 1, 20, 40),
('c1319b40-27b3-4d4c-9b90-fd1ad6bdf5b5', (SELECT id FROM warehouses WHERE name = 'Main Warehouse'), 87, 12, 0, 20, 40),
('349d71f3-10a8-4bda-958b-842b320e415c', (SELECT id FROM warehouses WHERE name = 'Main Warehouse'), 62, 8, 0, 15, 35);

-- Insert stock for phones in east coast
INSERT INTO stock (product_id, warehouse_id, quantity_available, quantity_reserved, quantity_damaged, reorder_level, reorder_quantity) VALUES
('c4bcd8ae-e9b1-4e04-9fa6-819a6b446e93', (SELECT id FROM warehouses WHERE name = 'East Coast Hub'), 134, 20, 1, 20, 50),
('e181ea08-b83f-4231-83f3-22a31b29d448', (SELECT id FROM warehouses WHERE name = 'East Coast Hub'), 75, 10, 0, 20, 40),
('c1319b40-27b3-4d4c-9b90-fd1ad6bdf5b5', (SELECT id FROM warehouses WHERE name = 'East Coast Hub'), 95, 15, 1, 20, 40),
('349d71f3-10a8-4bda-958b-842b320e415c', (SELECT id FROM warehouses WHERE name = 'East Coast Hub'), 48, 6, 0, 15, 35);

-- Insert stock for clothing
INSERT INTO stock (product_id, warehouse_id, quantity_available, quantity_reserved, quantity_damaged, reorder_level, reorder_quantity) VALUES
('0e09e84a-3a10-4831-8d5b-bc6a8011b902', (SELECT id FROM warehouses WHERE name = 'Main Warehouse'), 250, 45, 5, 50, 100),
('756e763f-5c23-4300-9e08-555f3aa23358', (SELECT id FROM warehouses WHERE name = 'Main Warehouse'), 180, 30, 2, 40, 80),
('324d0524-f80e-492d-a89b-89ee53a8d6cf', (SELECT id FROM warehouses WHERE name = 'Main Warehouse'), 95, 15, 1, 30, 60);

-- Insert stock history for audit trail
INSERT INTO stock_history (stock_id, previous_quantity, new_quantity, change_reason, reference_type) VALUES
((SELECT id FROM stock WHERE product_id = 'd56e2ef7-66ba-40c9-a4e9-c81595f614f1' AND warehouse_id = (SELECT id FROM warehouses WHERE name = 'Main Warehouse')), 50, 45, 'Sales', 'ORDER'),
((SELECT id FROM stock WHERE product_id = 'c4bcd8ae-e9b1-4e04-9fa6-819a6b446e93' AND warehouse_id = (SELECT id FROM warehouses WHERE name = 'Main Warehouse')), 165, 156, 'Damage Report', 'DAMAGE'),
((SELECT id FROM stock WHERE product_id = '0e09e84a-3a10-4831-8d5b-bc6a8011b902' AND warehouse_id = (SELECT id FROM warehouses WHERE name = 'Main Warehouse')), 245, 250, 'Stock Received', 'RECEIPT');
