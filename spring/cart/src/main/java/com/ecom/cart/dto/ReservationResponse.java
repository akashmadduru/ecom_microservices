package com.ecom.cart.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.time.LocalDateTime;

/**
 * Reservation response DTO from Inventory Service.
 * No Lombok - uses manual getters/setters for consistency with Phase 1 requirements.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class ReservationResponse {

    private Long id;
    private Long productId;
    private String userId;
    private Integer quantity;
    private Boolean isReleased;
    private LocalDateTime createdAt;

    public ReservationResponse() {
    }

    public ReservationResponse(Long id, Long productId, String userId, Integer quantity, Boolean isReleased, LocalDateTime createdAt) {
        this.id = id;
        this.productId = productId;
        this.userId = userId;
        this.quantity = quantity;
        this.isReleased = isReleased;
        this.createdAt = createdAt;
    }

    public static ReservationResponseBuilder builder() {
        return new ReservationResponseBuilder();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getProductId() {
        return productId;
    }

    public void setProductId(Long productId) {
        this.productId = productId;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public Integer getQuantity() {
        return quantity;
    }

    public void setQuantity(Integer quantity) {
        this.quantity = quantity;
    }

    public Boolean getIsReleased() {
        return isReleased;
    }

    public void setIsReleased(Boolean isReleased) {
        this.isReleased = isReleased;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public static class ReservationResponseBuilder {
        private Long id;
        private Long productId;
        private String userId;
        private Integer quantity;
        private Boolean isReleased;
        private LocalDateTime createdAt;

        public ReservationResponseBuilder id(Long id) {
            this.id = id;
            return this;
        }

        public ReservationResponseBuilder productId(Long productId) {
            this.productId = productId;
            return this;
        }

        public ReservationResponseBuilder userId(String userId) {
            this.userId = userId;
            return this;
        }

        public ReservationResponseBuilder quantity(Integer quantity) {
            this.quantity = quantity;
            return this;
        }

        public ReservationResponseBuilder isReleased(Boolean isReleased) {
            this.isReleased = isReleased;
            return this;
        }

        public ReservationResponseBuilder createdAt(LocalDateTime createdAt) {
            this.createdAt = createdAt;
            return this;
        }

        public ReservationResponse build() {
            return new ReservationResponse(id, productId, userId, quantity, isReleased, createdAt);
        }
    }
}
