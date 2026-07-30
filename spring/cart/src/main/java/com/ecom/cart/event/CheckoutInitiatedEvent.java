package com.ecom.cart.event;

import java.time.LocalDateTime;
import java.util.UUID;

public record CheckoutInitiatedEvent(
    UUID sagaId,
    Long cartId,
    String userId,
    LocalDateTime timestamp
) {
    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private UUID sagaId;
        private Long cartId;
        private String userId;
        private LocalDateTime timestamp;

        public Builder sagaId(UUID sagaId) {
            this.sagaId = sagaId;
            return this;
        }

        public Builder cartId(Long cartId) {
            this.cartId = cartId;
            return this;
        }

        public Builder userId(String userId) {
            this.userId = userId;
            return this;
        }

        public Builder timestamp(LocalDateTime timestamp) {
            this.timestamp = timestamp;
            return this;
        }

        public CheckoutInitiatedEvent build() {
            return new CheckoutInitiatedEvent(sagaId, cartId, userId, timestamp);
        }
    }
}
