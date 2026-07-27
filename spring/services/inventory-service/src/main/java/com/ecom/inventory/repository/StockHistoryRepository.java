package com.ecom.inventory.repository;

import com.ecom.inventory.model.StockHistory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

/**
 * StockHistoryRepository: Repository for StockHistory audit trail.
 *
 * Supports querying the immutable history of all stock mutations.
 */
public interface StockHistoryRepository extends BaseRepository<StockHistory, Long> {

    /**
     * Find all history entries for a stock (audit trail).
     *
     * @param stockId the stock ID
     * @param pageable pagination (most recent first)
     * @return Page of history entries
     */
    @Query("SELECT sh FROM StockHistory sh WHERE sh.stockId = :stockId ORDER BY sh.createdAt DESC")
    Page<StockHistory> findByStockId(@Param("stockId") Long stockId, Pageable pageable);

    /**
     * Find all history entries for a product.
     *
     * @param productId the product ID
     * @param pageable pagination
     * @return Page of history entries
     */
    @Query("SELECT sh FROM StockHistory sh WHERE sh.productId = :productId ORDER BY sh.createdAt DESC")
    Page<StockHistory> findByProductId(@Param("productId") Long productId, Pageable pageable);

    /**
     * Find history entries by operation type (for specific operation analysis).
     *
     * @param operationType the operation type (RESERVE, DEDUCT, RELEASE, ADJUST)
     * @param pageable pagination
     * @return Page of entries
     */
    Page<StockHistory> findByOperationType(String operationType, Pageable pageable);

    /**
     * Find history entries for a specific stock and operation type.
     *
     * @param stockId the stock ID
     * @param operationType the operation type
     * @return List of entries
     */
    @Query("SELECT sh FROM StockHistory sh WHERE sh.stockId = :stockId AND sh.operationType = :operationType ORDER BY sh.createdAt DESC")
    List<StockHistory> findByStockIdAndOperationType(
            @Param("stockId") Long stockId,
            @Param("operationType") String operationType
    );

    /**
     * Check for duplicate operation (idempotency check).
     * Returns true if an entry with the same stock_id and reason already exists.
     *
     * @param stockId the stock ID
     * @param reason the operation reason/reference
     * @return true if duplicate exists, false otherwise
     */
    @Query("SELECT COUNT(sh) > 0 FROM StockHistory sh WHERE sh.stockId = :stockId AND sh.reason = :reason")
    boolean existsByStockIdAndReason(@Param("stockId") Long stockId, @Param("reason") String reason);

    /**
     * Find recent operations for a product (within last N hours).
     *
     * @param productId the product ID
     * @param since the start time
     * @return List of recent entries
     */
    @Query("SELECT sh FROM StockHistory sh WHERE sh.productId = :productId AND sh.createdAt >= :since ORDER BY sh.createdAt DESC")
    List<StockHistory> findRecentByProductId(@Param("productId") Long productId, @Param("since") LocalDateTime since);

    /**
     * Count operations by type for reporting.
     *
     * @param productId the product ID
     * @param operationType the operation type
     * @return count of operations
     */
    @Query("SELECT COUNT(sh) FROM StockHistory sh WHERE sh.productId = :productId AND sh.operationType = :operationType")
    long countByProductIdAndOperationType(@Param("productId") Long productId, @Param("operationType") String operationType);

    /**
     * Find total quantity change for an operation type.
     *
     * @param productId the product ID
     * @param operationType the operation type
     * @return sum of quantity changes (negative for deductions)
     */
    @Query("SELECT COALESCE(SUM(sh.qtyChange), 0) FROM StockHistory sh WHERE sh.productId = :productId AND sh.operationType = :operationType")
    long sumQtyChangeByOperationType(@Param("productId") Long productId, @Param("operationType") String operationType);
}
