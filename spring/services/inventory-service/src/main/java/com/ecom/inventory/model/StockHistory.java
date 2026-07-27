package com.ecom.inventory.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.ToString;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * StockHistory: Audit trail for all stock mutations.
 *
 * Every change to Stock (reserve, deduct, release, adjust) is logged here
 * for compliance, debugging, and reconciliation.
 *
 * Immutable once created (no updates after insert).
 */
@Entity
@Table(name = "stock_history", indexes = {
    @Index(name = "idx_stock_history_product_id", columnList = "product_id"),
    @Index(name = "idx_stock_history_stock_id", columnList = "stock_id"),
    @Index(name = "idx_stock_history_created_at", columnList = "created_at DESC"),
    @Index(name = "idx_stock_history_product_created", columnList = "product_id, created_at DESC")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@ToString
public class StockHistory {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * Foreign key to Stock entity.
     */
    @Column(name = "stock_id", nullable = false)
    private Long stockId;

    /**
     * Denormalized product_id for reporting queries.
     */
    @Column(name = "product_id", nullable = false)
    private Long productId;

    /**
     * Operation type: RESERVE, DEDUCT, RELEASE, ADJUST
     */
    @Column(name = "operation_type", nullable = false, length = 20)
    private String operationType;

    /**
     * Quantity change (positive for additions, negative for deductions).
     */
    @Column(name = "qty_change", nullable = false)
    private Integer qtyChange;

    /**
     * Reference for deduplication and tracing (e.g., "ORDER_123", "PAYMENT_FAILED", "ADMIN_ADJUSTMENT").
     * Critical for idempotency: if same reason is retried, skip.
     */
    @Column(name = "reason", nullable = false, length = 255)
    private String reason;

    /**
     * Available qty before operation (for audit trail).
     */
    @Column(name = "available_qty_before", nullable = false)
    private Integer availableQtyBefore = 0;

    /**
     * Reserved qty before operation (for audit trail).
     */
    @Column(name = "reserved_qty_before", nullable = false)
    private Integer reservedQtyBefore = 0;

    /**
     * Available qty after operation.
     */
    @Column(name = "available_qty_after", nullable = false)
    private Integer availableQtyAfter = 0;

    /**
     * Reserved qty after operation.
     */
    @Column(name = "reserved_qty_after", nullable = false)
    private Integer reservedQtyAfter = 0;

    /**
     * User or system that performed the operation.
     */
    @Column(name = "created_by", length = 64)
    private String createdBy = "SYSTEM";

    /**
     * Timestamp of operation.
     */
    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public StockHistory(Long stockId, Long productId, String operationType, Integer qtyChange, String reason) {
        this.stockId = stockId;
        this.productId = productId;
        this.operationType = operationType;
        this.qtyChange = qtyChange;
        this.reason = reason;
        this.createdAt = LocalDateTime.now();
    }
}
