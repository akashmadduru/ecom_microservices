package com.ecom.inventory.repository;

import com.ecom.inventory.model.Stock;
import com.ecom.inventory.model.StockHistory;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * StockMutationRepository: Custom repository for atomic stock mutations.
 *
 * Handles complex stock operations with:
 * - Pessimistic locking to prevent race conditions
 * - Automatic audit trail creation
 * - Idempotency via reason-based deduplication
 * - Version-based optimistic locking as fallback
 *
 * All methods are transactional with REQUIRED propagation (joins parent if exists).
 */
public interface StockMutationRepository {

    /**
     * Reserve stock for an order.
     * Atomically: SELECT FOR UPDATE, verify available_qty >= qty, decrement available_qty, increment reserved_qty
     *
     * @param productId the product ID
     * @param quantity the quantity to reserve
     * @param reason the order reference (e.g., "ORDER_123") for idempotency
     * @return updated Stock
     * @throws com.ecom.common.exception.ConflictException if insufficient stock or duplicate reservation
     */
    @Transactional(propagation = Propagation.REQUIRED)
    Stock reserveStock(Long productId, Integer quantity, String reason);

    /**
     * Deduct stock after payment confirmation.
     * Atomically: SELECT FOR UPDATE, decrement reserved_qty, increment sold_qty
     *
     * @param productId the product ID
     * @param quantity the quantity to deduct
     * @param reason the payment reference (e.g., "PAYMENT_123") for idempotency
     * @return updated Stock
     * @throws com.ecom.common.exception.ConflictException if reserved_qty < quantity or duplicate deduction
     */
    @Transactional(propagation = Propagation.REQUIRED)
    Stock deductStock(Long productId, Integer quantity, String reason);

    /**
     * Release reserved stock (order cancelled or expired).
     * Atomically: SELECT FOR UPDATE, decrement reserved_qty, increment available_qty
     *
     * @param productId the product ID
     * @param quantity the quantity to release
     * @param reason the cancellation reference (e.g., "ORDER_CANCELLED_123") for idempotency
     * @return updated Stock
     * @throws com.ecom.common.exception.ConflictException if reserved_qty < quantity or duplicate release
     */
    @Transactional(propagation = Propagation.REQUIRED)
    Stock releaseStock(Long productId, Integer quantity, String reason);

    /**
     * Admin adjustment of stock (inventory count correction, damage, etc.).
     * Atomically: SELECT FOR UPDATE, set available_qty and reserved_qty to specified values
     *
     * @param productId the product ID
     * @param availableQty the new available quantity
     * @param reservedQty the new reserved quantity
     * @param reason the adjustment reason (e.g., "INVENTORY_CORRECTION") for audit
     * @param adjustedBy the admin user performing adjustment
     * @return updated Stock
     * @throws com.ecom.common.exception.ValidationException if quantities < 0
     */
    @Transactional(propagation = Propagation.REQUIRED)
    Stock adjustStock(Long productId, Integer availableQty, Integer reservedQty, String reason, String adjustedBy);

    /**
     * Create stock entry for a new product.
     * Atomically: INSERT Stock with initial quantities
     *
     * @param productId the product ID
     * @param sku the SKU
     * @param initialAvailableQty the initial available quantity
     * @param safetyStock the safety stock threshold
     * @param reorderThreshold the reorder point
     * @return created Stock
     * @throws com.ecom.common.exception.ConflictException if stock already exists for product
     */
    @Transactional(propagation = Propagation.REQUIRED)
    Stock createStock(Long productId, String sku, Integer initialAvailableQty, Integer safetyStock, Integer reorderThreshold);

    /**
     * Update stock location for multi-warehouse support.
     *
     * @param productId the product ID
     * @param newWarehouseLocation the new warehouse location
     * @return updated Stock
     */
    @Transactional(propagation = Propagation.REQUIRED)
    Stock updateWarehouseLocation(Long productId, String newWarehouseLocation);
}
