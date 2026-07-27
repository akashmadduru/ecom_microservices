package com.ecom.inventory.repository;

import com.ecom.common.exception.ConflictException;
import com.ecom.common.exception.ValidationException;
import com.ecom.inventory.model.Stock;
import com.ecom.inventory.model.StockHistory;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * StockMutationRepositoryImpl: Implementation of atomic stock mutations.
 *
 * Handles:
 * - Pessimistic locking via findByProductIdWithLock()
 * - Idempotency via duplicate reason detection
 * - Automatic audit trail creation
 * - Version field updates for optimistic locking
 */
@Repository
@Slf4j
@RequiredArgsConstructor
public class StockMutationRepositoryImpl implements StockMutationRepository {
    private final StockRepository stockRepository;
    private final StockHistoryRepository stockHistoryRepository;

    @Override
    @Transactional(propagation = Propagation.REQUIRED)
    public Stock reserveStock(Long productId, Integer quantity, String reason) {
        log.info("Attempting to reserve {} qty for product {} with reason: {}", quantity, productId, reason);

        // Pessimistic lock: acquire SELECT FOR UPDATE
        Stock stock = stockRepository.findByProductIdWithLock(productId)
                .orElseThrow(() -> new com.ecom.common.exception.NotFoundException("Stock not found for product: " + productId));

        // Check for duplicate (idempotency)
        if (stockHistoryRepository.existsByStockIdAndReason(stock.getId(), reason)) {
            log.warn("Duplicate reservation attempt for product {} with reason {}, skipping", productId, reason);
            return stock;
        }

        // Validate
        if (stock.getAvailableQty() < quantity) {
            throw new ConflictException("Insufficient available stock: required " + quantity + ", available " + stock.getAvailableQty());
        }

        if (quantity <= 0) {
            throw new ValidationException("Reservation quantity must be positive");
        }

        // Capture before state
        Integer availableQtyBefore = stock.getAvailableQty();
        Integer reservedQtyBefore = stock.getReservedQty();

        // Mutate
        stock.setAvailableQty(stock.getAvailableQty() - quantity);
        stock.setReservedQty(stock.getReservedQty() + quantity);
        stock.setVersion(stock.getVersion() + 1);
        stock.setUpdatedAt(LocalDateTime.now());

        // Save (triggers optimistic lock version check)
        stock = stockRepository.save(stock);

        // Audit trail
        StockHistory history = new StockHistory(
                stock.getId(),
                productId,
                "RESERVE",
                -quantity,  // negative: moving from available to reserved
                reason
        );
        history.setAvailableQtyBefore(availableQtyBefore);
        history.setReservedQtyBefore(reservedQtyBefore);
        history.setAvailableQtyAfter(stock.getAvailableQty());
        history.setReservedQtyAfter(stock.getReservedQty());
        stockHistoryRepository.save(history);

        log.info("Reserved {} qty for product {}", quantity, productId);
        return stock;
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRED)
    public Stock deductStock(Long productId, Integer quantity, String reason) {
        log.info("Attempting to deduct {} qty for product {} with reason: {}", quantity, productId, reason);

        Stock stock = stockRepository.findByProductIdWithLock(productId)
                .orElseThrow(() -> new com.ecom.common.exception.NotFoundException("Stock not found for product: " + productId));

        // Check for duplicate (idempotency)
        if (stockHistoryRepository.existsByStockIdAndReason(stock.getId(), reason)) {
            log.warn("Duplicate deduction attempt for product {} with reason {}, skipping", productId, reason);
            return stock;
        }

        // Validate
        if (stock.getReservedQty() < quantity) {
            throw new ConflictException("Insufficient reserved stock: required " + quantity + ", reserved " + stock.getReservedQty());
        }

        if (quantity <= 0) {
            throw new ValidationException("Deduction quantity must be positive");
        }

        // Capture before state
        Integer availableQtyBefore = stock.getAvailableQty();
        Integer reservedQtyBefore = stock.getReservedQty();

        // Mutate: move from reserved to sold
        stock.setReservedQty(stock.getReservedQty() - quantity);
        stock.setSoldQty(stock.getSoldQty() + quantity);
        stock.setVersion(stock.getVersion() + 1);
        stock.setUpdatedAt(LocalDateTime.now());

        // Save
        stock = stockRepository.save(stock);

        // Audit trail
        StockHistory history = new StockHistory(
                stock.getId(),
                productId,
                "DEDUCT",
                -quantity,
                reason
        );
        history.setAvailableQtyBefore(availableQtyBefore);
        history.setReservedQtyBefore(reservedQtyBefore);
        history.setAvailableQtyAfter(stock.getAvailableQty());
        history.setReservedQtyAfter(stock.getReservedQty());
        stockHistoryRepository.save(history);

        log.info("Deducted {} qty for product {}", quantity, productId);
        return stock;
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRED)
    public Stock releaseStock(Long productId, Integer quantity, String reason) {
        log.info("Attempting to release {} qty for product {} with reason: {}", quantity, productId, reason);

        Stock stock = stockRepository.findByProductIdWithLock(productId)
                .orElseThrow(() -> new com.ecom.common.exception.NotFoundException("Stock not found for product: " + productId));

        // Check for duplicate
        if (stockHistoryRepository.existsByStockIdAndReason(stock.getId(), reason)) {
            log.warn("Duplicate release attempt for product {} with reason {}, skipping", productId, reason);
            return stock;
        }

        // Validate
        if (stock.getReservedQty() < quantity) {
            throw new ConflictException("Insufficient reserved stock: required " + quantity + ", reserved " + stock.getReservedQty());
        }

        if (quantity <= 0) {
            throw new ValidationException("Release quantity must be positive");
        }

        // Capture before state
        Integer availableQtyBefore = stock.getAvailableQty();
        Integer reservedQtyBefore = stock.getReservedQty();

        // Mutate: return from reserved back to available
        stock.setReservedQty(stock.getReservedQty() - quantity);
        stock.setAvailableQty(stock.getAvailableQty() + quantity);
        stock.setVersion(stock.getVersion() + 1);
        stock.setUpdatedAt(LocalDateTime.now());

        // Save
        stock = stockRepository.save(stock);

        // Audit trail
        StockHistory history = new StockHistory(
                stock.getId(),
                productId,
                "RELEASE",
                quantity,
                reason
        );
        history.setAvailableQtyBefore(availableQtyBefore);
        history.setReservedQtyBefore(reservedQtyBefore);
        history.setAvailableQtyAfter(stock.getAvailableQty());
        history.setReservedQtyAfter(stock.getReservedQty());
        stockHistoryRepository.save(history);

        log.info("Released {} qty for product {}", quantity, productId);
        return stock;
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRED)
    public Stock adjustStock(Long productId, Integer availableQty, Integer reservedQty, String reason, String adjustedBy) {
        log.info("Attempting to adjust stock for product {} to available={}, reserved={}, reason: {}", productId, availableQty, reservedQty, reason);

        Stock stock = stockRepository.findByProductIdWithLock(productId)
                .orElseThrow(() -> new com.ecom.common.exception.NotFoundException("Stock not found for product: " + productId));

        // Validate
        if (availableQty < 0 || reservedQty < 0) {
            throw new ValidationException("Stock quantities cannot be negative");
        }

        // Capture before state
        Integer availableQtyBefore = stock.getAvailableQty();
        Integer reservedQtyBefore = stock.getReservedQty();

        // Mutate
        stock.setAvailableQty(availableQty);
        stock.setReservedQty(reservedQty);
        stock.setVersion(stock.getVersion() + 1);
        stock.setUpdatedAt(LocalDateTime.now());

        // Save
        stock = stockRepository.save(stock);

        // Audit trail
        StockHistory history = new StockHistory(
                stock.getId(),
                productId,
                "ADJUST",
                0,  // adjustment doesn't have a simple qty change
                reason
        );
        history.setAvailableQtyBefore(availableQtyBefore);
        history.setReservedQtyBefore(reservedQtyBefore);
        history.setAvailableQtyAfter(stock.getAvailableQty());
        history.setReservedQtyAfter(stock.getReservedQty());
        history.setCreatedBy(adjustedBy);
        stockHistoryRepository.save(history);

        log.info("Adjusted stock for product {}", productId);
        return stock;
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRED)
    public Stock createStock(Long productId, String sku, Integer initialAvailableQty, Integer safetyStock, Integer reorderThreshold) {
        log.info("Creating stock for product {} with SKU: {}", productId, sku);

        // Check for duplicate
        if (stockRepository.existsByProductId(productId)) {
            throw new ConflictException("Stock already exists for product: " + productId);
        }

        // Validate
        if (initialAvailableQty < 0) {
            throw new ValidationException("Initial available quantity cannot be negative");
        }

        // Create
        Stock stock = new Stock(productId, sku);
        stock.setAvailableQty(initialAvailableQty);
        stock.setReservedQty(0);
        stock.setSafetyStock(safetyStock != null ? safetyStock : 0);
        stock.setReorderThreshold(reorderThreshold != null ? reorderThreshold : 10);
        stock.setWarehouseLocation("DEFAULT");
        stock.setStatus("IN_STOCK");
        stock.setCreatedAt(LocalDateTime.now());
        stock.setUpdatedAt(LocalDateTime.now());

        stock = stockRepository.save(stock);

        log.info("Created stock for product {}", productId);
        return stock;
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRED)
    public Stock updateWarehouseLocation(Long productId, String newWarehouseLocation) {
        log.info("Updating warehouse location for product {} to: {}", productId, newWarehouseLocation);

        Stock stock = stockRepository.findByProductIdWithLock(productId)
                .orElseThrow(() -> new com.ecom.common.exception.NotFoundException("Stock not found for product: " + productId));

        stock.setWarehouseLocation(newWarehouseLocation);
        stock.setVersion(stock.getVersion() + 1);
        stock.setUpdatedAt(LocalDateTime.now());

        stock = stockRepository.save(stock);

        log.info("Updated warehouse location for product {}", productId);
        return stock;
    }
}
