-- V1: Create baseline taxonomy tables
-- Manufacturer, Brand, Category, Collection, ProductAttribute, AttributeValue, Tag

CREATE TABLE manufacturers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) UNIQUE NOT NULL,
    country_of_origin CHAR(2),
    contact_info JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_manufacturer_name ON manufacturers(name);

CREATE TABLE brands (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) UNIQUE NOT NULL,
    slug VARCHAR(220) UNIQUE NOT NULL,
    logo_url TEXT,
    manufacturer_id INTEGER REFERENCES manufacturers(id),
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_brand_name ON brands(name);
CREATE INDEX idx_brand_slug ON brands(slug);

CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    parent_id INTEGER REFERENCES categories(id),
    name VARCHAR(150) NOT NULL,
    slug VARCHAR(170) UNIQUE NOT NULL,
    path TEXT NOT NULL,
    depth INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(parent_id, name)
);

CREATE INDEX idx_category_slug ON categories(slug);

CREATE TABLE collections (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(220) UNIQUE NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    starts_at TIMESTAMP,
    ends_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_collection_slug ON collections(slug);

CREATE TABLE product_attributes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    code VARCHAR(100) UNIQUE NOT NULL,
    is_variant_defining BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_attribute_code ON product_attributes(code);

CREATE TABLE attribute_values (
    id SERIAL PRIMARY KEY,
    attribute_id INTEGER NOT NULL REFERENCES product_attributes(id),
    value VARCHAR(150) NOT NULL,
    slug VARCHAR(160) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE(attribute_id, value)
);

CREATE TABLE tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(80) UNIQUE NOT NULL,
    slug VARCHAR(90) UNIQUE NOT NULL
);

CREATE INDEX idx_tag_slug ON tags(slug);
