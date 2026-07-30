package com.ecom.cart.event;

import java.time.LocalDateTime;
import java.util.UUID;

public record InventoryReservedEvent(
    UUID sagaId,
    Long productId,
    Integer quantity,
    UUID reservationId,
    LocalDateTime timestamp
) {
    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private UUID sagaId;
        private Long productId;
        private Integer quantity;
        private UUID reservationId;
        private LocalDateTime timestamp;

        public Builder sagaId(UUID sagaId) {
            this.sagaId = sagaId;
            return this;
        }

        public Builder productId(Long productId) {
            this.productId = productId;
            return this;
        }

        public Builder quantity(Integer quantity) {
            this.quantity = quantity;
            return this;
        }

        public Builder reservationId(UUID reservationId) {
            this.reservationId = reservationId;
            return this;
        }

        public Builder timestamp(LocalDateTime timestamp) {
            this.timestamp = timestamp;
            return this;
        }

        public InventoryReservedEvent build() {
            return new InventoryReservedEvent(sagaId, productId, quantity, reservationId, timestamp);
        }
    }
}
