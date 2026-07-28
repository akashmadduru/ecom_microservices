-- V6: Schema documentation via comments and basic permission setup

-- Table comments for documentation
COMMENT ON TABLE manufacturers IS 'Product manufacturers/OEMs';
COMMENT ON TABLE brands IS 'Product brands with logos and descriptions';
COMMENT ON TABLE categories IS 'Product categories with self-referencing hierarchy (path for ltree queries)';
COMMENT ON TABLE collections IS 'Curated products groupings (seasonal sales, featured items)';
COMMENT ON TABLE product_attributes IS 'Attribute types for defining products variants (Size, Color, etc.)';
COMMENT ON TABLE attribute_values IS 'Specific values for attributes (S, M, L for Size attribute)';
COMMENT ON TABLE tags IS 'Keyword tags for products (eco-friendly, bestseller, on-sale)';
COMMENT ON TABLE products IS 'Core products catalog with soft-delete, audit fields, and TSVECTOR search';
COMMENT ON TABLE product_variants IS 'Product variants with barcodes, dimensions, shipping info';
COMMENT ON TABLE product_images IS 'Product images with kind discrimination (PRIMARY, GALLERY, etc.)';
COMMENT ON TABLE product_tags IS 'Product-Tag many-to-many junction table';
COMMENT ON TABLE collection_products IS 'Collection-Product many-to-many junction table with sort order';
COMMENT ON TABLE product_variant_attribute_values IS 'ProductVariant-AttributeValue many-to-many junction table';

-- Column comments
COMMENT ON COLUMN products.path IS 'For ltree: dot-separated category path like "electronics.mobiles.smartphones"';
COMMENT ON COLUMN products.search_document IS 'TSVECTOR column for full-text search (auto-maintained by trigger)';
COMMENT ON COLUMN products.is_deleted IS 'Soft-delete flag (along with deleted_at and deleted_by for audit)';
COMMENT ON COLUMN product_variants.attributes IS 'JSONB spec-attributes (any key-value metadata specific to this variant)';
COMMENT ON COLUMN products.attributes IS 'JSONB spec-attributes bag for products-level custom metadata';

-- Index comments
COMMENT ON INDEX ix_products_search_document_gin IS 'GIN index for fast full-text search on search_document TSVECTOR';
COMMENT ON INDEX idx_categories_path_ltree IS 'GiST index for fast category subtree queries using path::ltree';

-- Note on performance:
-- - TSVECTOR search_document is auto-maintained by trigger; queries use @@
--   Example: WHERE search_document @@ to_tsquery('english', 'laptop:*')
-- - Category hierarchy uses ltree for O(log N) subtree queries
--   Example: WHERE path::ltree <@ CAST('electronics.mobiles' AS ltree)
-- - All soft-deleted records are excluded by default: WHERE is_deleted = FALSE
-- - Attributes (JSONB) can be queried with @>, ->, ->> operators
--   Example: WHERE attributes->>'color' = 'red'

-- Basic security: create role for application (if needed)
-- Note: Actual role creation and grants should be managed by deployment scripts
-- This is just a template:
-- DO $$
-- BEGIN
--     CREATE ROLE ecom_app_user WITH LOGIN PASSWORD 'secure_password';
-- EXCEPTION WHEN duplicate_object THEN
--     NULL;
-- END
-- $$;
-- GRANT CONNECT ON DATABASE ecom_product TO ecom_app_user;
-- GRANT USAGE ON SCHEMA public TO ecom_app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ecom_app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ecom_app_user;
