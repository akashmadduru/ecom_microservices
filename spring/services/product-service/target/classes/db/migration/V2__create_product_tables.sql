-- V2: Create Product and ProductVariant tables with full metadata

CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    uniq_id VARCHAR(64) UNIQUE,
    title TEXT NOT NULL,
    slug VARCHAR(320) UNIQUE NOT NULL,
    product_url TEXT,
    retail_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
    discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    image_urls TEXT,
    description TEXT,
    category TEXT,
    sub_category TEXT,
    brand TEXT,
    rating NUMERIC(3, 2) NOT NULL DEFAULT 0,
    review_count INTEGER NOT NULL DEFAULT 0,
    seller_id VARCHAR(64),
    brand_id INTEGER REFERENCES brands(id),
    manufacturer_id INTEGER REFERENCES manufacturers(id),
    category_id INTEGER REFERENCES categories(id),
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    seo_title VARCHAR(255),
    seo_description VARCHAR(500),
    canonical_url TEXT,
    meta_keywords TEXT[],
    attributes JSONB NOT NULL DEFAULT '{}',
    search_document TSVECTOR,
    created_by VARCHAR(64),
    updated_by VARCHAR(64),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(64),
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Product indexes
CREATE INDEX ix_products_uniq_id ON products(uniq_id);
CREATE INDEX ix_products_slug ON products(slug);
CREATE INDEX ix_products_seller_id ON products(seller_id);
CREATE INDEX ix_products_brand_id ON products(brand_id);
CREATE INDEX ix_products_category_id ON products(category_id);
CREATE INDEX ix_products_status ON products(status);
CREATE INDEX ix_products_is_deleted ON products(is_deleted);
CREATE INDEX ix_products_published_category ON products(category_id) WHERE status = 'PUBLISHED' AND is_deleted = FALSE;
CREATE INDEX ix_products_attributes_gin ON products USING GIN(attributes);
CREATE INDEX ix_products_search_document_gin ON products USING GIN(search_document);

CREATE TABLE product_variants (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    variant_name VARCHAR(200) NOT NULL,
    barcode VARCHAR(64),
    upc VARCHAR(64),
    ean VARCHAR(64),
    hsn_code VARCHAR(16),
    gst_category VARCHAR(40),
    country_of_origin CHAR(2),
    weight_grams INTEGER,
    length_mm INTEGER,
    width_mm INTEGER,
    height_mm INTEGER,
    fragile BOOLEAN NOT NULL DEFAULT FALSE,
    shipping_class VARCHAR(40),
    manufacturer_warranty_months INTEGER,
    serial_number_required BOOLEAN NOT NULL DEFAULT FALSE,
    expiry_tracked BOOLEAN NOT NULL DEFAULT FALSE,
    attributes JSONB NOT NULL DEFAULT '{}',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_product_variants_product_id ON product_variants(product_id);
CREATE INDEX idx_product_variants_hsn ON product_variants(hsn_code);
-- Partial unique indexes for barcode/upc/ean (allow NULL duplicates)
CREATE UNIQUE INDEX uq_product_variants_barcode ON product_variants(barcode) WHERE barcode IS NOT NULL;
CREATE UNIQUE INDEX uq_product_variants_upc ON product_variants(upc) WHERE upc IS NOT NULL;
CREATE UNIQUE INDEX uq_product_variants_ean ON product_variants(ean) WHERE ean IS NOT NULL;
CREATE INDEX ix_product_variants_attributes_gin ON product_variants USING GIN(attributes);
