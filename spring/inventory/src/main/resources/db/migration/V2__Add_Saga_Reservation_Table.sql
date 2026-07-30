-- V2__Add_Saga_Reservation_Table.sql
CREATE TABLE IF NOT EXISTS saga_reservation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id UUID NOT NULL UNIQUE,
    saga_id UUID NOT NULL,
    product_id BIGINT NOT NULL,
    quantity INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL,
    version BIGINT DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_saga_reservation_saga_id ON saga_reservation(saga_id);
CREATE INDEX idx_saga_reservation_product_id ON saga_reservation(product_id);
CREATE INDEX idx_saga_reservation_status ON saga_reservation(status);
