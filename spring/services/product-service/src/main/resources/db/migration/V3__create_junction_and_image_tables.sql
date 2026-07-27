-- V3: Create junction tables (ProductTag, CollectionProduct, ProductVariantAttributeValue) and ProductImage

CREATE TABLE product_tags (
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY(product_id, tag_id)
);

CREATE TABLE collection_products (
    collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(collection_id, product_id)
);

CREATE TABLE product_variant_attribute_values (
    variant_id INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    attribute_value_id INTEGER NOT NULL REFERENCES attribute_values(id) ON DELETE CASCADE,
    PRIMARY KEY(variant_id, attribute_value_id)
);

CREATE TABLE product_images (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id INTEGER REFERENCES product_variants(id) ON DELETE CASCADE,
    kind VARCHAR(20) NOT NULL DEFAULT 'GALLERY',
    url TEXT NOT NULL,
    video_url TEXT,
    alt_text VARCHAR(255),
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX ix_product_images_product_id ON product_images(product_id);
CREATE INDEX ix_product_images_variant_id ON product_images(variant_id);
-- Unique constraint for PRIMARY image per product/variant (NULLs not distinct in PostgreSQL 15+)
CREATE UNIQUE INDEX uq_product_images_primary ON product_images(product_id, variant_id) WHERE kind = 'PRIMARY';
