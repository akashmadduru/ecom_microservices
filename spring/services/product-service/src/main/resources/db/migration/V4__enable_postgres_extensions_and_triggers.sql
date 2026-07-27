-- V4: Enable PostgreSQL extensions and create triggers for auto-maintained fields

-- Enable ltree extension for category hierarchy queries
CREATE EXTENSION IF NOT EXISTS ltree;

-- Enable pgcrypto for UUID generation if needed
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create trigger function to auto-update TSVECTOR search_document
-- This combines title and description into a full-text searchable document
CREATE OR REPLACE FUNCTION update_product_search_document()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_document := to_tsvector('english', COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.description, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update search_document on INSERT or UPDATE
CREATE TRIGGER trg_product_search_document
BEFORE INSERT OR UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION update_product_search_document();

-- Create trigger function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply timestamp trigger to core tables
CREATE TRIGGER trg_manufacturers_timestamp
BEFORE UPDATE ON manufacturers
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_brands_timestamp
BEFORE UPDATE ON brands
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_categories_timestamp
BEFORE UPDATE ON categories
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_collections_timestamp
BEFORE UPDATE ON collections
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_products_timestamp
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_product_variants_timestamp
BEFORE UPDATE ON product_variants
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();
