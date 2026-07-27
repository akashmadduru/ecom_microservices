package com.ecom.inventory.service;

import com.ecom.common.event.EventEnvelope;
import com.ecom.common.event.EventType;
import com.ecom.common.event.Topics;
import com.ecom.common.exception.ConflictException;
import com.ecom.common.exception.NotFoundException;
import com.ecom.common.exception.ValidationException;
import com.ecom.common.pagination.Page;
import com.ecom.common.pagination.PageRequest;
import com.ecom.inventory.dto.ReserveStockRequest;
import com.ecom.inventory.dto.ReserveStockResponse;
import com.ecom.inventory.dto.StockHistoryResponse;
import com.ecom.inventory.dto.StockPageResponse;
import com.ecom.inventory.dto.StockResponse;
import com.ecom.inventory.model.Stock;
import com.ecom.inventory.model.StockHistory;
import com.ecom.inventory.repository.StockHistoryRepository;
import com.ecom.inventory.repository.StockMutationRepository;
import com.ecom.inventory.repository.StockRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * InventoryService: business logic for stock operations.
 *
 * Handles:
 * - Stock reservations for orders
 * - Stock deductions after payment
 * - Stock releases on order cancellation
 * - RBAC enforcement for admin operations
 * - Event publishing for stock mutations
 * - Audit trail queries
 */
@Service
@Transactional
public class InventoryService {
    private static final Logger log = LoggerFactory.getLogger(InventoryService.class);
    private final StockRepository stockRepository;
    private final StockHistoryRepository stockHistoryRepository;
    private final StockMutationRepository stockMutationRepository;
    private final KafkaTemplate<String, EventEnvelope> kafkaTemplate;

    public InventoryService(StockRepository stockRepository,
                           StockHistoryRepository stockHistoryRepository,
                           StockMutationRepository stockMutationRepository,
                           KafkaTemplate<String, EventEnvelope> kafkaTemplate) {
        this.stockRepository = stockRepository;
        this.stockHistoryRepository = stockHistoryRepository;
        this.stockMutationRepository = stockMutationRepository;
        this.kafkaTemplate = kafkaTemplate;
    }

    /**
     * Reserve stock for an order (called on ORDER_CREATED event).
     * Acquires pessimistic lock, validates availability, creates history entry.
     *
     * @param productId the product ID
     * @param quantity the quantity to reserve
     * @param orderId the order ID (used as idempotency key via reason field)
     * @return operation result with status and current quantities
     */
    public ReserveStockResponse reserveStock(Long productId, Integer quantity, String orderId) {
        log.info("Attempting to reserve {} units of product {} for order {}", quantity, productId, orderId);

        if (quantity == null || quantity <= 0) {
            throw new ValidationException("Quantity must be positive");
        }

        try {
            Stock stock = stockMutationRepository.reserveStock(productId, quantity, "ORDER_" + orderId);
            log.info("Successfully reserved {} units of product {} for order {}", quantity, productId, orderId);

            // Publish event
            publishStockReservedEvent(stock, quantity, orderId);

            ReserveStockResponse response = new ReserveStockResponse();
            response.setStatus("SUCCESS");
            response.setMessage("Stock reserved successfully");
            response.setProductId(productId);
            response.setReservedQty(stock.getReservedQty());
            response.setAvailableQty(stock.getAvailableQty());
            return response;
        } catch (ConflictException e) {
            log.warn("Failed to reserve stock for order {}: {}", orderId, e.getMessage());
            throw e;
        } catch (Exception e) {
            log.error("Unexpected error while reserving stock for order {}: {}", orderId, e.getMessage(), e);
            throw new ValidationException("Failed to reserve stock: " + e.getMessage());
        }
    }

    /**
     * Deduct reserved stock after payment confirmation (called on PAYMENT_COMPLETED event).
     * Moves quantity from reserved to sold, confirms payment was successful.
     *
     * @param productId the product ID
     * @param quantity the quantity to deduct
     * @param orderId the order ID
     * @param paymentId the payment ID (used as idempotency key via reason field)
     */
    public void deductStock(Long productId, Integer quantity, String orderId, String paymentId) {
        log.info("Attempting to deduct {} units of product {} for order {} with payment {}", quantity, productId, orderId, paymentId);

        if (quantity == null || quantity <= 0) {
            throw new ValidationException("Quantity must be positive");
        }

        try {
            Stock stock = stockMutationRepository.deductStock(productId, quantity, "PAYMENT_" + paymentId);
            log.info("Successfully deducted {} units of product {} for order {}", quantity, productId, orderId);

            // Publish event
            publishStockDeductedEvent(stock, quantity, orderId, paymentId);
        } catch (ConflictException e) {
            log.warn("Failed to deduct stock for order {}: {}", orderId, e.getMessage());
            throw e;
        } catch (Exception e) {
            log.error("Unexpected error while deducting stock for order {}: {}", orderId, e.getMessage(), e);
            throw new ValidationException("Failed to deduct stock: " + e.getMessage());
        }
    }

    /**
     * Release reserved stock on order cancellation (called on ORDER_CANCELLED event).
     * Returns quantity from reserved back to available.
     *
     * @param productId the product ID
     * @param quantity the quantity to release
     * @param orderId the order ID (used as idempotency key via reason field)
     */
    public void releaseStock(Long productId, Integer quantity, String orderId) {
        log.info("Attempting to release {} units of product {} for cancelled order {}", quantity, productId, orderId);

        if (quantity == null || quantity <= 0) {
            throw new ValidationException("Quantity must be positive");
        }

        try {
            Stock stock = stockMutationRepository.releaseStock(productId, quantity, "ORDER_CANCELLED_" + orderId);
            log.info("Successfully released {} units of product {} for cancelled order {}", quantity, productId, orderId);

            // Publish event
            publishStockReleasedEvent(stock, quantity, orderId);
        } catch (ConflictException e) {
            log.warn("Failed to release stock for order {}: {}", orderId, e.getMessage());
            throw e;
        } catch (Exception e) {
            log.error("Unexpected error while releasing stock for order {}: {}", orderId, e.getMessage(), e);
            throw new ValidationException("Failed to release stock: " + e.getMessage());
        }
    }

    /**
     * Get current stock information for a product (public, no lock).
     *
     * @param productId the product ID
     * @return stock information including availability
     * @throws NotFoundException if product stock not found
     */
    @Transactional(readOnly = true)
    public StockResponse getStockInfo(Long productId) {
        log.debug("Fetching stock info for product {}", productId);

        Stock stock = stockRepository.findByProductIdForRead(productId)
                .orElseThrow(() -> new NotFoundException("Stock not found for product " + productId));

        return toStockResponse(stock);
    }

    /**
     * Get audit trail for a product (paginated).
     *
     * @param productId the product ID
     * @param pageRequest pagination parameters
     * @return paginated stock history
     */
    @Transactional(readOnly = true)
    public StockPageResponse getStockHistory(Long productId, PageRequest pageRequest) {
        log.debug("Fetching stock history for product {} with pagination {}", productId, pageRequest.getPage());

        pageRequest.validate();
        org.springframework.data.domain.Pageable pageable = org.springframework.data.domain.PageRequest
                .of((pageRequest.getPage() - 1), pageRequest.getLimit());

        org.springframework.data.domain.Page<StockHistory> page = stockHistoryRepository.findByProductId(productId, pageable);

        StockPageResponse response = new StockPageResponse();
        response.setData(page.getContent().stream().map(this::toStockHistoryResponse).toList());
        response.setPage(pageRequest.getPage());
        response.setLimit(pageRequest.getLimit());
        response.setTotalItems(page.getTotalElements());
        response.setTotalPages(page.getTotalPages());
        response.setHasMore(page.hasNext());
        return response;
    }

    /**
     * Admin-only: manually adjust stock (inventory count correction, damage, etc.).
     *
     * @param productId the product ID
     * @param availableQty new available quantity
     * @param reservedQty new reserved quantity
     * @param reason adjustment reason
     */
    public void adjustStock(Long productId, Integer availableQty, Integer reservedQty, String reason) {
        log.info("Admin adjusting stock for product {}: available={}, reserved={}, reason={}", productId, availableQty, reservedQty, reason);

        String userId = getCurrentUserId();

        if (availableQty == null || availableQty < 0) {
            throw new ValidationException("Available quantity must be non-negative");
        }
        if (reservedQty == null || reservedQty < 0) {
            throw new ValidationException("Reserved quantity must be non-negative");
        }

        try {
            Stock stock = stockMutationRepository.adjustStock(productId, availableQty, reservedQty, reason, userId);
            log.info("Successfully adjusted stock for product {}", productId);

            // Publish event
            publishStockAdjustedEvent(stock, availableQty, reservedQty, reason, userId);
        } catch (Exception e) {
            log.error("Failed to adjust stock for product {}: {}", productId, e.getMessage(), e);
            throw new ValidationException("Failed to adjust stock: " + e.getMessage());
        }
    }

    /**
     * Get low stock alerts (safety stock threshold).
     *
     * @param pageRequest pagination parameters
     * @return paginated low stock items
     */
    @Transactional(readOnly = true)
    public Page<StockResponse> getLowStockAlerts(PageRequest pageRequest) {
        log.debug("Fetching low stock alerts with pagination {}", pageRequest.getPage());

        pageRequest.validate();
        org.springframework.data.domain.Pageable pageable = org.springframework.data.domain.PageRequest
                .of((pageRequest.getPage() - 1), pageRequest.getLimit());

        org.springframework.data.domain.Page<Stock> page = stockRepository.findAllLowStock(pageable);

        return Page.of(
                page.getContent().stream().map(this::toStockResponse).toList(),
                pageRequest.getPage(),
                pageRequest.getLimit(),
                page.getTotalElements()
        );
    }

    /**
     * Convert Stock entity to StockResponse DTO.
     */
    private StockResponse toStockResponse(Stock stock) {
        StockResponse response = new StockResponse();
        response.setId(stock.getId());
        response.setProductId(stock.getProductId());
        response.setSku(stock.getSku());
        response.setAvailableQty(stock.getAvailableQty());
        response.setReservedQty(stock.getReservedQty());
        response.setTotalQty(stock.getTotalQuantity());
        response.setSoldQty(stock.getSoldQty());
        response.setSafetyStock(stock.getSafetyStock());
        response.setReorderThreshold(stock.getReorderThreshold());
        response.setWarehouseLocation(stock.getWarehouseLocation());
        response.setStatus(stock.getStatus());
        response.setVersion(stock.getVersion());
        response.setUpdatedAt(stock.getUpdatedAt());
        response.setCreatedAt(stock.getCreatedAt());
        return response;
    }

    /**
     * Convert StockHistory entity to StockHistoryResponse DTO.
     */
    private StockHistoryResponse toStockHistoryResponse(StockHistory history) {
        StockHistoryResponse response = new StockHistoryResponse();
        response.setId(history.getId());
        response.setStockId(history.getStockId());
        response.setProductId(history.getProductId());
        response.setOperationType(history.getOperationType());
        response.setQtyChange(history.getQtyChange());
        response.setReason(history.getReason());
        response.setAvailableQtyBefore(history.getAvailableQtyBefore());
        response.setAvailableQtyAfter(history.getAvailableQtyAfter());
        response.setReservedQtyBefore(history.getReservedQtyBefore());
        response.setReservedQtyAfter(history.getReservedQtyAfter());
        response.setCreatedBy(history.getCreatedBy());
        response.setCreatedAt(history.getCreatedAt());
        return response;
    }

    /**
     * Publish INVENTORY_RESERVED event to Kafka.
     */
    private void publishStockReservedEvent(Stock stock, Integer quantity, String orderId) {
        try {
            Map<String, Object> payload = new HashMap<>();
            payload.put("product_id", stock.getProductId());
            payload.put("sku", stock.getSku());
            payload.put("qty_reserved", quantity);
            payload.put("available_qty", stock.getAvailableQty());
            payload.put("reserved_qty", stock.getReservedQty());
            payload.put("order_id", orderId);
            payload.put("status", stock.getStatus());

            EventEnvelope event = new EventEnvelope();
            event.setEventId(UUID.randomUUID().toString());
            event.setEventType(EventType.INVENTORY_RESERVED);
            event.setEventVersion(1);
            event.setOccurredAt(Instant.now());
            event.setProducer("inventory-service");
            event.setCorrelationId(orderId);
            event.setPartitionKey(stock.getProductId().toString());
            event.setPayload(payload);

            kafkaTemplate.send(Topics.INVENTORY, stock.getProductId().toString(), event);
            log.debug("Published INVENTORY_RESERVED event for product {}", stock.getProductId());
        } catch (Exception e) {
            // Don't fail writes if Kafka is down
            log.warn("Failed to publish INVENTORY_RESERVED event: {}", e.getMessage());
        }
    }

    /**
     * Publish STOCK_DEDUCTED event to Kafka.
     */
    private void publishStockDeductedEvent(Stock stock, Integer quantity, String orderId, String paymentId) {
        try {
            Map<String, Object> payload = new HashMap<>();
            payload.put("product_id", stock.getProductId());
            payload.put("sku", stock.getSku());
            payload.put("qty_deducted", quantity);
            payload.put("available_qty", stock.getAvailableQty());
            payload.put("reserved_qty", stock.getReservedQty());
            payload.put("sold_qty", stock.getSoldQty());
            payload.put("order_id", orderId);
            payload.put("payment_id", paymentId);
            payload.put("status", stock.getStatus());

            EventEnvelope event = new EventEnvelope();
            event.setEventId(UUID.randomUUID().toString());
            event.setEventType(EventType.STOCK_DEDUCTED);
            event.setEventVersion(1);
            event.setOccurredAt(Instant.now());
            event.setProducer("inventory-service");
            event.setCorrelationId(orderId);
            event.setPartitionKey(stock.getProductId().toString());
            event.setPayload(payload);

            kafkaTemplate.send(Topics.INVENTORY, stock.getProductId().toString(), event);
            log.debug("Published STOCK_DEDUCTED event for product {}", stock.getProductId());
        } catch (Exception e) {
            // Don't fail writes if Kafka is down
            log.warn("Failed to publish STOCK_DEDUCTED event: {}", e.getMessage());
        }
    }

    /**
     * Publish INVENTORY_RELEASED event to Kafka.
     */
    private void publishStockReleasedEvent(Stock stock, Integer quantity, String orderId) {
        try {
            Map<String, Object> payload = new HashMap<>();
            payload.put("product_id", stock.getProductId());
            payload.put("sku", stock.getSku());
            payload.put("qty_released", quantity);
            payload.put("available_qty", stock.getAvailableQty());
            payload.put("reserved_qty", stock.getReservedQty());
            payload.put("order_id", orderId);
            payload.put("status", stock.getStatus());

            EventEnvelope event = new EventEnvelope();
            event.setEventId(UUID.randomUUID().toString());
            event.setEventType(EventType.INVENTORY_RELEASED);
            event.setEventVersion(1);
            event.setOccurredAt(Instant.now());
            event.setProducer("inventory-service");
            event.setCorrelationId(orderId);
            event.setPartitionKey(stock.getProductId().toString());
            event.setPayload(payload);

            kafkaTemplate.send(Topics.INVENTORY, stock.getProductId().toString(), event);
            log.debug("Published INVENTORY_RELEASED event for product {}", stock.getProductId());
        } catch (Exception e) {
            // Don't fail writes if Kafka is down
            log.warn("Failed to publish INVENTORY_RELEASED event: {}", e.getMessage());
        }
    }

    /**
     * Publish INVENTORY_UPDATED event to Kafka after admin adjustment.
     */
    private void publishStockAdjustedEvent(Stock stock, Integer availableQty, Integer reservedQty, String reason, String userId) {
        try {
            Map<String, Object> payload = new HashMap<>();
            payload.put("product_id", stock.getProductId());
            payload.put("sku", stock.getSku());
            payload.put("available_qty", availableQty);
            payload.put("reserved_qty", reservedQty);
            payload.put("reason", reason);
            payload.put("adjusted_by", userId);
            payload.put("status", stock.getStatus());

            EventEnvelope event = new EventEnvelope();
            event.setEventId(UUID.randomUUID().toString());
            event.setEventType(EventType.INVENTORY_UPDATED);
            event.setEventVersion(1);
            event.setOccurredAt(Instant.now());
            event.setProducer("inventory-service");
            event.setPartitionKey(stock.getProductId().toString());
            event.setPayload(payload);

            kafkaTemplate.send(Topics.INVENTORY, stock.getProductId().toString(), event);
            log.debug("Published INVENTORY_UPDATED event for product {}", stock.getProductId());
        } catch (Exception e) {
            // Don't fail writes if Kafka is down
            log.warn("Failed to publish INVENTORY_UPDATED event: {}", e.getMessage());
        }
    }

    /**
     * Get current authenticated user ID.
     */
    private String getCurrentUserId() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }
}
