package com.ecom.inventory.repository;

import com.ecom.inventory.model.Stock;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * StockRepository: Repository for Stock entity with pessimistic locking support.
 *
 * Key methods:
 * - findByProductIdWithLock: Pessimistic lock for mutations (SELECT FOR UPDATE)
 * - findByProductIdForRead: No lock for read operations
 * - findAllLowStock: Alert queries for inventory management
 */
public interface StockRepository extends BaseRepository<Stock, Long> {

    /**
     * Find stock by product ID with pessimistic lock (SELECT FOR UPDATE).
     * Used before mutations to prevent concurrent conflicts.
     *
     * @param productId the product ID
     * @return Optional<Stock> with PESSIMISTIC_WRITE lock acquired
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM Stock s WHERE s.productId = :productId")
    Optional<Stock> findByProductIdWithLock(@Param("productId") Long productId);

    /**
     * Find stock by product ID without lock (for read-only queries).
     *
     * @param productId the product ID
     * @return Optional<Stock> without lock
     */
    @Query("SELECT s FROM Stock s WHERE s.productId = :productId")
    Optional<Stock> findByProductIdForRead(@Param("productId") Long productId);

    /**
     * Find stock by SKU (alternative lookup).
     *
     * @param sku the SKU
     * @return Optional<Stock>
     */
    Optional<Stock> findBySku(String sku);

    /**
     * Find all stocks below safety stock threshold (low stock alerts).
     *
     * @param safetyStock the safety stock threshold
     * @param pageable pagination
     * @return Page of low-stock items
     */
    @Query("SELECT s FROM Stock s WHERE s.availableQty < s.safetyStock")
    Page<Stock> findAllLowStock(Pageable pageable);

    /**
     * Find stocks below reorder threshold (replenishment alerts).
     *
     * @param reorderThreshold the reorder threshold
     * @return List of items needing replenishment
     */
    @Query("SELECT s FROM Stock s WHERE s.availableQty < s.reorderThreshold")
    List<Stock> findBelowReorderThreshold(@Param("reorderThreshold") Integer reorderThreshold);

    /**
     * Find all out-of-stock items.
     *
     * @return List of out-of-stock stocks
     */
    @Query("SELECT s FROM Stock s WHERE s.status = 'OUT_OF_STOCK'")
    List<Stock> findOutOfStock();

    /**
     * Check if stock exists for a product.
     *
     * @param productId the product ID
     * @return true if stock exists, false otherwise
     */
    boolean existsByProductId(Long productId);

    /**
     * Count total available inventory across all products.
     *
     * @return total available quantity
     */
    @Query("SELECT COALESCE(SUM(s.availableQty), 0) FROM Stock s")
    Long countTotalAvailable();

    /**
     * Count total reserved inventory across all products.
     *
     * @return total reserved quantity
     */
    @Query("SELECT COALESCE(SUM(s.reservedQty), 0) FROM Stock s")
    Long countTotalReserved();
}
