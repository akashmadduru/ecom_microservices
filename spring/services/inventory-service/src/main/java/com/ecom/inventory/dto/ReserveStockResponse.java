package com.ecom.inventory.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * ReserveStockResponse: DTO for reserve operation results.
 * Indicates success/failure and current reserved quantity.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ReserveStockResponse {
    private String status;
    private String message;
    @JsonProperty("product_id")
    private Long productId;
    @JsonProperty("reserved_qty")
    private Integer reservedQty;
    @JsonProperty("available_qty")
    private Integer availableQty;
    private String reason;

    public ReserveStockResponse() {
    }

    public ReserveStockResponse(String status, String message, Long productId, Integer reservedQty, Integer availableQty) {
        this.status = status;
        this.message = message;
        this.productId = productId;
        this.reservedQty = reservedQty;
        this.availableQty = availableQty;
    }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    public Long getProductId() { return productId; }
    public void setProductId(Long productId) { this.productId = productId; }
    public Integer getReservedQty() { return reservedQty; }
    public void setReservedQty(Integer reservedQty) { this.reservedQty = reservedQty; }
    public Integer getAvailableQty() { return availableQty; }
    public void setAvailableQty(Integer availableQty) { this.availableQty = availableQty; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
}
