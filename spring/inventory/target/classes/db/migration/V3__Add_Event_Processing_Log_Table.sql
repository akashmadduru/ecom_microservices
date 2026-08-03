-- V3__Add_Event_Processing_Log_Table.sql
CREATE TABLE IF NOT EXISTS event_processing_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL UNIQUE,
    event_type VARCHAR(255) NOT NULL,
    processed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_event_processing_log_event_id ON event_processing_log(event_id);
CREATE INDEX idx_event_processing_log_event_type ON event_processing_log(event_type);
