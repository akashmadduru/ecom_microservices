package com.ecom.inventory.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.ToString;
import org.hibernate.annotations.DynamicInsert;
import org.hibernate.annotations.DynamicUpdate;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * Stock: Inventory stock ledger for a product.
 *
 * Tracks available and reserved quantities with version field for optimistic locking.
 * Uses pessimistic locking (@Lock) on read operations before mutations.
 *
 * Invariants:
 * - available_qty >= 0 (checked by database constraint)
 * - reserved_qty >= 0 (checked by database constraint)
 * - available_qty + reserved_qty represents total stock on hand
 */
@Entity
@Table(name = "stock", indexes = {
    @Index(name = "idx_stock_product_id", columnList = "product_id", unique = true)
})
@DynamicInsert
@DynamicUpdate
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@ToString
public class Stock {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * Foreign key to Product service database (no JPA relationship).
     * Product service owns the product entity; inventory is decoupled.
     */
    @Column(name = "product_id", nullable = false, unique = true)
    private Long productId;

    /**
     * SKU from Product service (denormalized for indexing).
     */
    @Column(name = "sku", nullable = false, unique = true, length = 64)
    private String sku;

    /**
     * Available quantity ready for reservation.
     * Constraint: available_qty >= 0
     */
    @Column(name = "available_qty", nullable = false)
    private Integer availableQty = 0;

    /**
     * Reserved quantity (holds for pending orders).
     * Constraint: reserved_qty >= 0
     * Transitions from 0 -> reserved_qty on OrderCreated -> deduct -> 0 after payment
     * or back to 0 on OrderCancelled (release).
     */
    @Column(name = "reserved_qty", nullable = false)
    private Integer reservedQty = 0;

    /**
     * Safety stock threshold (minimum inventory level).
     * Used for low stock alerts.
     */
    @Column(name = "safety_stock", nullable = false)
    private Integer safetyStock = 0;

    /**
     * Reorder point threshold (triggers replenishment alerts).
     */
    @Column(name = "reorder_threshold", nullable = false)
    private Integer reorderThreshold = 10;

    /**
     * Total sold quantity (cumulative).
     */
    @Column(name = "sold_qty", nullable = false)
    private Integer soldQty = 0;

    /**
     * Warehouse location (supports future multi-warehouse).
     */
    @Column(name = "warehouse_location", nullable = false, length = 120)
    private String warehouseLocation = "DEFAULT";

    /**
     * Current stock status (enum: IN_STOCK, LOW_STOCK, OUT_OF_STOCK).
     */
    @Column(name = "status", nullable = false, length = 20)
    private String status = "OUT_OF_STOCK";

    /**
     * Version field for optimistic locking (fallback if pessimistic lock fails).
     * Incremented on every mutation.
     */
    @Version
    @Column(name = "version", nullable = false)
    private Long version = 1L;

    /**
     * Timestamp of last mutation (updated by @UpdateTimestamp trigger).
     */
    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    /**
     * Creation timestamp.
     */
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    public Stock(Long productId, String sku) {
        this.productId = productId;
        this.sku = sku;
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    /**
     * Calculate total quantity on hand.
     */
    public Integer getTotalQuantity() {
        return (availableQty != null ? availableQty : 0) + (reservedQty != null ? reservedQty : 0);
    }
}
