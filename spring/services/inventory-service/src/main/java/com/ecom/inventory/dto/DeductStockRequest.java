package com.ecom.inventory.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

/**
 * DeductStockRequest: DTO for deducting stock after payment confirmation.
 * Triggered by PAYMENT_COMPLETED event.
 */
public class DeductStockRequest {
    @JsonProperty("product_id")
    @NotNull(message = "Product ID is required")
    private Long productId;

    @NotNull(message = "Quantity is required")
    @Positive(message = "Quantity must be positive")
    private Integer quantity;

    @JsonProperty("order_id")
    @NotNull(message = "Order ID is required")
    private String orderId;

    @JsonProperty("payment_id")
    private String paymentId;

    public DeductStockRequest() {
    }

    public DeductStockRequest(Long productId, Integer quantity, String orderId, String paymentId) {
        this.productId = productId;
        this.quantity = quantity;
        this.orderId = orderId;
        this.paymentId = paymentId;
    }

    public Long getProductId() {
        return productId;
    }

    public void setProductId(Long productId) {
        this.productId = productId;
    }

    public Integer getQuantity() {
        return quantity;
    }

    public void setQuantity(Integer quantity) {
        this.quantity = quantity;
    }

    public String getOrderId() {
        return orderId;
    }

    public void setOrderId(String orderId) {
        this.orderId = orderId;
    }

    public String getPaymentId() {
        return paymentId;
    }

    public void setPaymentId(String paymentId) {
        this.paymentId = paymentId;
    }
}
