package com.ecom.cart.event;

import java.time.LocalDateTime;
import java.util.UUID;

public record CheckoutCompletedEvent(
    UUID sagaId,
    Long cartId,
    LocalDateTime timestamp
) {
    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private UUID sagaId;
        private Long cartId;
        private LocalDateTime timestamp;

        public Builder sagaId(UUID sagaId) {
            this.sagaId = sagaId;
            return this;
        }

        public Builder cartId(Long cartId) {
            this.cartId = cartId;
            return this;
        }

        public Builder timestamp(LocalDateTime timestamp) {
            this.timestamp = timestamp;
            return this;
        }

        public CheckoutCompletedEvent build() {
            return new CheckoutCompletedEvent(sagaId, cartId, timestamp);
        }
    }
}
