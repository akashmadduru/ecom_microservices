-- V2__Add_Saga_State_Table.sql
CREATE TABLE IF NOT EXISTS saga_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    saga_id UUID NOT NULL UNIQUE,
    cart_id BIGINT NOT NULL,
    status VARCHAR(50) NOT NULL,
    version BIGINT DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE INDEX idx_saga_state_saga_id ON saga_state(saga_id);
CREATE INDEX idx_saga_state_cart_id ON saga_state(cart_id);
CREATE INDEX idx_saga_state_status ON saga_state(status);
