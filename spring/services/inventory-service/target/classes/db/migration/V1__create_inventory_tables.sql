-- V1: Create inventory schema with stock ledger and audit trail

CREATE TABLE stock (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL UNIQUE,
    sku VARCHAR(64) NOT NULL UNIQUE,
    available_qty INTEGER NOT NULL DEFAULT 0,
    reserved_qty INTEGER NOT NULL DEFAULT 0,
    safety_stock INTEGER NOT NULL DEFAULT 0,
    reorder_threshold INTEGER NOT NULL DEFAULT 10,
    sold_qty INTEGER NOT NULL DEFAULT 0,
    warehouse_location VARCHAR(120) NOT NULL DEFAULT 'DEFAULT',
    status VARCHAR(20) NOT NULL DEFAULT 'OUT_OF_STOCK',
    version BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for rapid lookups
CREATE UNIQUE INDEX idx_stock_product_id ON stock(product_id);
CREATE INDEX idx_stock_sku ON stock(sku);
CREATE INDEX idx_stock_warehouse ON stock(warehouse_location);

-- Check constraints to enforce business rules
ALTER TABLE stock ADD CONSTRAINT check_available_qty_nonneg CHECK (available_qty >= 0);
ALTER TABLE stock ADD CONSTRAINT check_reserved_qty_nonneg CHECK (reserved_qty >= 0);
ALTER TABLE stock ADD CONSTRAINT check_sold_qty_nonneg CHECK (sold_qty >= 0);
ALTER TABLE stock ADD CONSTRAINT check_valid_status CHECK (status IN ('IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'));

CREATE TABLE stock_history (
    id BIGSERIAL PRIMARY KEY,
    stock_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    operation_type VARCHAR(20) NOT NULL,
    qty_change INTEGER NOT NULL,
    reason VARCHAR(255) NOT NULL,
    available_qty_before INTEGER NOT NULL DEFAULT 0,
    reserved_qty_before INTEGER NOT NULL DEFAULT 0,
    available_qty_after INTEGER NOT NULL DEFAULT 0,
    reserved_qty_after INTEGER NOT NULL DEFAULT 0,
    created_by VARCHAR(64) NOT NULL DEFAULT 'SYSTEM',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for audit trail queries and reporting
CREATE INDEX idx_stock_history_product_id ON stock_history(product_id);
CREATE INDEX idx_stock_history_stock_id ON stock_history(stock_id);
CREATE INDEX idx_stock_history_created_at ON stock_history(created_at DESC);
CREATE INDEX idx_stock_history_product_created ON stock_history(product_id, created_at DESC);
CREATE INDEX idx_stock_history_operation ON stock_history(operation_type, created_at DESC);

-- Composite index for audit trail with reason (for idempotency checks)
CREATE INDEX idx_stock_history_stock_reason ON stock_history(stock_id, reason);

-- Check constraints for stock_history
ALTER TABLE stock_history ADD CONSTRAINT check_operation_type CHECK (
    operation_type IN ('RESERVE', 'DEDUCT', 'RELEASE', 'ADJUST')
);

-- Foreign key constraint (soft constraint - stock_history can survive stock deletion for audit)
ALTER TABLE stock_history ADD CONSTRAINT fk_stock_history_stock
    FOREIGN KEY (stock_id) REFERENCES stock(id) ON DELETE RESTRICT;

-- Trigger to update stock.updated_at on every mutation (optional, can be handled by JPA)
-- CREATE OR REPLACE FUNCTION update_stock_timestamp()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   NEW.updated_at := NOW();
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;
--
-- CREATE TRIGGER trg_stock_timestamp
-- BEFORE UPDATE ON stock
-- FOR EACH ROW
-- EXECUTE FUNCTION update_stock_timestamp();
