package com.ecom.cart.event;

import java.time.LocalDateTime;
import java.util.UUID;

public record InventoryReservationFailedEvent(
    UUID sagaId,
    String reason,
    LocalDateTime timestamp
) {
    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private UUID sagaId;
        private String reason;
        private LocalDateTime timestamp;

        public Builder sagaId(UUID sagaId) {
            this.sagaId = sagaId;
            return this;
        }

        public Builder reason(String reason) {
            this.reason = reason;
            return this;
        }

        public Builder timestamp(LocalDateTime timestamp) {
            this.timestamp = timestamp;
            return this;
        }

        public InventoryReservationFailedEvent build() {
            return new InventoryReservationFailedEvent(sagaId, reason, timestamp);
        }
    }
}
