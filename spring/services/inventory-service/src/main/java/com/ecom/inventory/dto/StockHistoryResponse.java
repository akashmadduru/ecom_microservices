package com.ecom.inventory.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.LocalDateTime;

/**
 * StockHistoryResponse: DTO for audit trail queries.
 * Represents a single mutation event with before/after state.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class StockHistoryResponse {
    private Long id;
    @JsonProperty("stock_id")
    private Long stockId;
    @JsonProperty("product_id")
    private Long productId;
    @JsonProperty("operation_type")
    private String operationType;
    @JsonProperty("qty_change")
    private Integer qtyChange;
    private String reason;
    @JsonProperty("available_qty_before")
    private Integer availableQtyBefore;
    @JsonProperty("available_qty_after")
    private Integer availableQtyAfter;
    @JsonProperty("reserved_qty_before")
    private Integer reservedQtyBefore;
    @JsonProperty("reserved_qty_after")
    private Integer reservedQtyAfter;
    @JsonProperty("created_by")
    private String createdBy;
    @JsonProperty("created_at")
    private LocalDateTime createdAt;

    public StockHistoryResponse() {
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getStockId() { return stockId; }
    public void setStockId(Long stockId) { this.stockId = stockId; }
    public Long getProductId() { return productId; }
    public void setProductId(Long productId) { this.productId = productId; }
    public String getOperationType() { return operationType; }
    public void setOperationType(String operationType) { this.operationType = operationType; }
    public Integer getQtyChange() { return qtyChange; }
    public void setQtyChange(Integer qtyChange) { this.qtyChange = qtyChange; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public Integer getAvailableQtyBefore() { return availableQtyBefore; }
    public void setAvailableQtyBefore(Integer availableQtyBefore) { this.availableQtyBefore = availableQtyBefore; }
    public Integer getAvailableQtyAfter() { return availableQtyAfter; }
    public void setAvailableQtyAfter(Integer availableQtyAfter) { this.availableQtyAfter = availableQtyAfter; }
    public Integer getReservedQtyBefore() { return reservedQtyBefore; }
    public void setReservedQtyBefore(Integer reservedQtyBefore) { this.reservedQtyBefore = reservedQtyBefore; }
    public Integer getReservedQtyAfter() { return reservedQtyAfter; }
    public void setReservedQtyAfter(Integer reservedQtyAfter) { this.reservedQtyAfter = reservedQtyAfter; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
