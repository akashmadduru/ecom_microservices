-- V5: Add additional indexes and expressions for query optimization

-- Full-text search index on search_document (GIN for best performance)
-- Already created in V2, but ensuring it exists

-- Add composite indexes for common query patterns
CREATE INDEX idx_products_status_brand ON products(status, brand_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_products_category_status ON products(category_id, status) WHERE is_deleted = FALSE;
CREATE INDEX idx_products_seller_status ON products(seller_id, status) WHERE is_deleted = FALSE;

-- Index on category path for ltree queries (GiST index for subtree queries)
CREATE INDEX idx_categories_path_ltree ON categories USING GIST(path::ltree);

-- Index on attribute combinations for variant filtering
CREATE INDEX idx_product_variants_status ON product_variants(status, product_id);

-- Indexes on foreign keys for JOIN performance
CREATE INDEX idx_product_images_product_variant ON product_images(product_id, variant_id);
CREATE INDEX idx_collection_products_collection ON collection_products(collection_id);
CREATE INDEX idx_collection_products_product ON collection_products(product_id);

-- Partial index for soft-deleted products (helps with common WHERE is_deleted = FALSE queries)
CREATE INDEX idx_products_not_deleted ON products(id) WHERE is_deleted = FALSE;

-- Add check constraints for data integrity
ALTER TABLE products ADD CONSTRAINT check_retail_price_nonneg CHECK (retail_price >= 0);
ALTER TABLE products ADD CONSTRAINT check_discount_nonneg CHECK (discount >= 0);
ALTER TABLE products ADD CONSTRAINT check_rating_range CHECK (rating >= 0 AND rating <= 5);
ALTER TABLE products ADD CONSTRAINT check_review_count_nonneg CHECK (review_count >= 0);

ALTER TABLE product_variants ADD CONSTRAINT check_weight_nonneg CHECK (weight_grams IS NULL OR weight_grams > 0);
ALTER TABLE product_variants ADD CONSTRAINT check_dimensions_nonneg
    CHECK ((length_mm IS NULL OR length_mm > 0) AND (width_mm IS NULL OR width_mm > 0) AND (height_mm IS NULL OR height_mm > 0));

-- Add check for valid status values
ALTER TABLE products ADD CONSTRAINT check_product_status
    CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'REJECTED', 'ARCHIVED', 'DISCONTINUED'));

ALTER TABLE product_variants ADD CONSTRAINT check_variant_status
    CHECK (status IN ('ACTIVE', 'INACTIVE', 'DISCONTINUED'));

ALTER TABLE product_images ADD CONSTRAINT check_image_kind
    CHECK (kind IN ('PRIMARY', 'GALLERY', 'THUMBNAIL', 'SPIN_360', 'VIDEO'));
