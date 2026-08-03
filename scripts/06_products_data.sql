-- Products Database Sample Data

-- Insert categories
INSERT INTO categories (name, slug, description, image_url, is_active, display_order) VALUES
('Electronics', 'electronics', 'Electronic devices and gadgets', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=300', TRUE, 1),
('Laptops', 'laptops', 'Computers and laptops', 'https://images.unsplash.com/photo-1588872657840-90a53d2b9d1a?w=300', TRUE, 2),
('Smartphones', 'smartphones', 'Mobile phones and accessories', 'https://images.unsplash.com/photo-1511707267537-b85faf00021e?w=300', TRUE, 3),
('Clothing', 'clothing', 'Apparel and fashion items', 'https://images.unsplash.com/photo-1489200344649-3a71f0ad7a6d?w=300', TRUE, 4),
('Home & Garden', 'home-garden', 'Home decor and garden supplies', 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=300', TRUE, 5),
('Books', 'books', 'Physical and digital books', 'https://images.unsplash.com/photo-150784272343-583f20270319?w=300', TRUE, 6);

-- Insert products (Electronics - Laptops)
INSERT INTO products (category_id, name, slug, description, short_description, sku, price, discount_price, discount_percent, rating, review_count, is_active) VALUES
((SELECT id FROM categories WHERE slug = 'laptops'), 'MacBook Pro 16"', 'macbook-pro-16', 'High-performance laptop for professionals', 'Intel Core i9, 16GB RAM, 512GB SSD', 'LAPTOP-001', 2499.99, 2199.99, 12, 4.8, 45, TRUE),
((SELECT id FROM categories WHERE slug = 'laptops'), 'Dell XPS 13', 'dell-xps-13', 'Ultra-portable and powerful laptop', 'Intel Core i7, 8GB RAM, 512GB SSD', 'LAPTOP-002', 1299.99, 1199.99, 8, 4.6, 32, TRUE),
((SELECT id FROM categories WHERE slug = 'laptops'), 'HP Pavilion 15', 'hp-pavilion-15', 'Affordable daily driver laptop', 'AMD Ryzen 5, 8GB RAM, 256GB SSD', 'LAPTOP-003', 599.99, 499.99, 17, 4.2, 18, TRUE),
((SELECT id FROM categories WHERE slug = 'laptops'), 'Lenovo ThinkPad X1', 'lenovo-thinkpad-x1', 'Business laptop with excellent keyboard', 'Intel Core i7, 16GB RAM, 512GB SSD', 'LAPTOP-004', 1599.99, 1399.99, 13, 4.7, 28, TRUE);

-- Insert products (Electronics - Smartphones)
INSERT INTO products (category_id, name, slug, description, short_description, sku, price, discount_price, discount_percent, rating, review_count, is_active) VALUES
((SELECT id FROM categories WHERE slug = 'smartphones'), 'iPhone 15 Pro', 'iphone-15-pro', 'Latest flagship smartphone from Apple', 'A17 Bionic, 128GB, 6.1" display', 'PHONE-001', 999.99, 899.99, 10, 4.9, 156, TRUE),
((SELECT id FROM categories WHERE slug = 'smartphones'), 'Samsung Galaxy S24', 'samsung-galaxy-s24', 'Powerful Android flagship', 'Snapdragon 8 Gen 3, 256GB, 6.1" display', 'PHONE-002', 899.99, 799.99, 11, 4.7, 98, TRUE),
((SELECT id FROM categories WHERE slug = 'smartphones'), 'Google Pixel 8', 'google-pixel-8', 'Best camera smartphone', 'Tensor G3, 128GB, 6.2" display', 'PHONE-003', 799.99, 699.99, 13, 4.8, 87, TRUE),
((SELECT id FROM categories WHERE slug = 'smartphones'), 'OnePlus 12', 'oneplus-12', 'Fast performance at competitive price', 'Snapdragon 8 Gen 3, 256GB, 6.7" display', 'PHONE-004', 649.99, 549.99, 15, 4.5, 62, TRUE);

-- Insert products (Clothing)
INSERT INTO products (category_id, name, slug, description, short_description, sku, price, discount_percent, rating, review_count, is_active) VALUES
((SELECT id FROM categories WHERE slug = 'clothing'), 'Premium Cotton T-Shirt', 'premium-cotton-tshirt', 'Comfortable and durable t-shirt', '100% organic cotton, multiple colors', 'CLOTH-001', 29.99, 20, 4.3, 45, TRUE),
((SELECT id FROM categories WHERE slug = 'clothing'), 'Slim Fit Jeans', 'slim-fit-jeans', 'Classic denim pants', 'Blue, 32-38 sizes', 'CLOTH-002', 79.99, 15, 4.4, 78, TRUE),
((SELECT id FROM categories WHERE slug = 'clothing'), 'Winter Jacket', 'winter-jacket', 'Warm and stylish winter coat', 'Wool blend, waterproof', 'CLOTH-003', 199.99, 25, 4.6, 54, TRUE);

-- Insert product images
INSERT INTO product_images (product_id, image_url, alt_text, is_primary, display_order) VALUES
((SELECT id FROM products WHERE sku = 'LAPTOP-001'), 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=500', 'MacBook Pro', TRUE, 1),
((SELECT id FROM products WHERE sku = 'LAPTOP-001'), 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=500', 'MacBook Pro side view', FALSE, 2),
((SELECT id FROM products WHERE sku = 'PHONE-001'), 'https://images.unsplash.com/photo-1592286927505-1def25115558?w=500', 'iPhone 15 Pro', TRUE, 1),
((SELECT id FROM products WHERE sku = 'PHONE-001'), 'https://images.unsplash.com/photo-1592286927505-1def25115558?w=500', 'iPhone 15 Pro colors', FALSE, 2),
((SELECT id FROM products WHERE sku = 'CLOTH-001'), 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=500', 'Cotton T-Shirt', TRUE, 1);

-- Insert product specifications
INSERT INTO product_specifications (product_id, spec_key, spec_value, display_order) VALUES
((SELECT id FROM products WHERE sku = 'LAPTOP-001'), 'Processor', 'Intel Core i9-13900H', 1),
((SELECT id FROM products WHERE sku = 'LAPTOP-001'), 'RAM', '16GB LPDDR5', 2),
((SELECT id FROM products WHERE sku = 'LAPTOP-001'), 'Storage', '512GB SSD', 3),
((SELECT id FROM products WHERE sku = 'LAPTOP-001'), 'Display', '16" Liquid Retina XDR', 4),
((SELECT id FROM products WHERE sku = 'PHONE-001'), 'Processor', 'A17 Bionic', 1),
((SELECT id FROM products WHERE sku = 'PHONE-001'), 'RAM', '8GB', 2),
((SELECT id FROM products WHERE sku = 'PHONE-001'), 'Storage', '128GB', 3),
((SELECT id FROM products WHERE sku = 'PHONE-001'), 'Display', '6.1" Super Retina XDR', 4),
((SELECT id FROM products WHERE sku = 'PHONE-001'), 'Camera', 'Dual 48MP + 12MP', 5);
