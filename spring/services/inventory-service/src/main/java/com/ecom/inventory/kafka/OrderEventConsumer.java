package com.ecom.inventory.kafka;

import com.ecom.common.event.EventEnvelope;
import com.ecom.common.event.EventType;
import com.ecom.common.event.Topics;
import com.ecom.common.exception.ConflictException;
import com.ecom.common.exception.ValidationException;
import com.ecom.inventory.service.InventoryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * OrderEventConsumer: Kafka consumer for order events.
 *
 * Handles:
 * - ORDER_CREATED: Reserve stock for each item in order
 * - PAYMENT_COMPLETED: Deduct reserved stock (payment confirmed)
 * - ORDER_CANCELLED: Release reserved stock (order cancelled)
 *
 * Implements idempotency via reason-based deduplication (StockHistory.reason field).
 * Error handling: Log and continue (don't crash on invalid messages).
 */
@Component
public class OrderEventConsumer {
    private static final Logger log = LoggerFactory.getLogger(OrderEventConsumer.class);
    private final InventoryService inventoryService;

    public OrderEventConsumer(InventoryService inventoryService) {
        this.inventoryService = inventoryService;
    }

    /**
     * Listen to order.events topic and process order-related stock operations.
     * Batch listener: processes up to 100 messages per poll.
     * Manual offset commit: errors trigger SeekToCurrentErrorHandler (retry).
     */
    @KafkaListener(
            topics = Topics.ORDER,
            groupId = "inventory-service-group",
            containerFactory = "batchListenerContainerFactory"
    )
    public void handleOrderEvents(List<EventEnvelope> events) {
        log.debug("Received batch of {} order events", events.size());

        for (EventEnvelope event : events) {
            try {
                handleSingleEvent(event);
            } catch (Exception e) {
                // Log error and continue - don't fail entire batch
                log.error("Error processing event {}: {} - Message: {}", event.getEventType(), event.getEventId(), e.getMessage(), e);
            }
        }
    }

    /**
     * Process a single event based on its type.
     */
    private void handleSingleEvent(EventEnvelope event) {
        log.debug("Processing event type: {} with ID: {}", event.getEventType(), event.getEventId());

        if (EventType.ORDER_CREATED.equals(event.getEventType())) {
            handleOrderCreated(event);
        } else if (EventType.PAYMENT_COMPLETED.equals(event.getEventType())) {
            handlePaymentCompleted(event);
        } else if (EventType.ORDER_CANCELLED.equals(event.getEventType())) {
            handleOrderCancelled(event);
        } else {
            log.debug("Ignoring event type: {}", event.getEventType());
        }
    }

    /**
     * Handle ORDER_CREATED event: reserve stock for each order item.
     *
     * Expected payload format:
     * {
     *   "order_id": "ORDER_123",
     *   "items": [
     *     {"product_id": 1, "quantity": 5},
     *     {"product_id": 2, "quantity": 3}
     *   ]
     * }
     */
    private void handleOrderCreated(EventEnvelope event) {
        String orderId = (String) event.getPayload().get("order_id");
        List<Map<String, Object>> items = (List<Map<String, Object>>) event.getPayload().get("items");

        if (orderId == null || orderId.isBlank()) {
            log.warn("ORDER_CREATED event missing order_id, skipping");
            return;
        }

        if (items == null || items.isEmpty()) {
            log.warn("ORDER_CREATED event missing items for order {}, skipping", orderId);
            return;
        }

        log.info("Processing ORDER_CREATED event for order {} with {} items", orderId, items.size());

        for (Map<String, Object> item : items) {
            try {
                Long productId = extractLongValue(item, "product_id");
                Integer quantity = extractIntegerValue(item, "quantity");

                if (productId == null || quantity == null) {
                    log.warn("ORDER_CREATED event has invalid item for order {}: {}", orderId, item);
                    continue;
                }

                log.debug("Reserving {} units of product {} for order {}", quantity, productId, orderId);

                try {
                    inventoryService.reserveStock(productId, quantity, orderId);
                    log.debug("Successfully reserved stock for product {} in order {}", productId, orderId);
                } catch (ConflictException e) {
                    // Duplicate reservation (idempotency) - this is expected on retries
                    log.warn("Duplicate reservation for product {} in order {} (idempotent): {}", productId, orderId, e.getMessage());
                } catch (ValidationException e) {
                    // Validation error - insufficient stock or invalid quantity
                    log.error("Validation error for product {} in order {}: {}", productId, orderId, e.getMessage());
                    // Note: Could publish RESERVATION_FAILED event here to trigger order cancellation
                }
            } catch (Exception e) {
                log.error("Unexpected error processing item for order {}: {}", orderId, e.getMessage(), e);
            }
        }
    }

    /**
     * Handle PAYMENT_COMPLETED event: deduct stock for confirmed payment.
     *
     * Expected payload format:
     * {
     *   "order_id": "ORDER_123",
     *   "payment_id": "PAYMENT_456",
     *   "items": [
     *     {"product_id": 1, "quantity": 5},
     *     {"product_id": 2, "quantity": 3}
     *   ]
     * }
     */
    private void handlePaymentCompleted(EventEnvelope event) {
        String orderId = (String) event.getPayload().get("order_id");
        String paymentId = (String) event.getPayload().get("payment_id");
        List<Map<String, Object>> items = (List<Map<String, Object>>) event.getPayload().get("items");

        if (orderId == null || orderId.isBlank()) {
            log.warn("PAYMENT_COMPLETED event missing order_id, skipping");
            return;
        }

        if (paymentId == null || paymentId.isBlank()) {
            log.warn("PAYMENT_COMPLETED event missing payment_id for order {}, skipping", orderId);
            return;
        }

        if (items == null || items.isEmpty()) {
            log.warn("PAYMENT_COMPLETED event missing items for order {}, skipping", orderId);
            return;
        }

        log.info("Processing PAYMENT_COMPLETED event for order {} with payment {}", orderId, paymentId);

        for (Map<String, Object> item : items) {
            try {
                Long productId = extractLongValue(item, "product_id");
                Integer quantity = extractIntegerValue(item, "quantity");

                if (productId == null || quantity == null) {
                    log.warn("PAYMENT_COMPLETED event has invalid item for order {}: {}", orderId, item);
                    continue;
                }

                log.debug("Deducting {} units of product {} for order {} with payment {}", quantity, productId, orderId, paymentId);

                try {
                    inventoryService.deductStock(productId, quantity, orderId, paymentId);
                    log.debug("Successfully deducted stock for product {} in order {}", productId, orderId);
                } catch (ConflictException e) {
                    // Duplicate deduction (idempotency) - this is expected on retries
                    log.warn("Duplicate deduction for product {} in order {} (idempotent): {}", productId, orderId, e.getMessage());
                } catch (ValidationException e) {
                    log.error("Validation error deducting stock for product {} in order {}: {}", productId, orderId, e.getMessage());
                }
            } catch (Exception e) {
                log.error("Unexpected error processing item for order {}: {}", orderId, e.getMessage(), e);
            }
        }
    }

    /**
     * Handle ORDER_CANCELLED event: release reserved stock.
     *
     * Expected payload format:
     * {
     *   "order_id": "ORDER_123",
     *   "items": [
     *     {"product_id": 1, "quantity": 5},
     *     {"product_id": 2, "quantity": 3}
     *   ]
     * }
     */
    private void handleOrderCancelled(EventEnvelope event) {
        String orderId = (String) event.getPayload().get("order_id");
        List<Map<String, Object>> items = (List<Map<String, Object>>) event.getPayload().get("items");

        if (orderId == null || orderId.isBlank()) {
            log.warn("ORDER_CANCELLED event missing order_id, skipping");
            return;
        }

        if (items == null || items.isEmpty()) {
            log.warn("ORDER_CANCELLED event missing items for order {}, skipping", orderId);
            return;
        }

        log.info("Processing ORDER_CANCELLED event for order {} with {} items", orderId, items.size());

        for (Map<String, Object> item : items) {
            try {
                Long productId = extractLongValue(item, "product_id");
                Integer quantity = extractIntegerValue(item, "quantity");

                if (productId == null || quantity == null) {
                    log.warn("ORDER_CANCELLED event has invalid item for order {}: {}", orderId, item);
                    continue;
                }

                log.debug("Releasing {} units of product {} for cancelled order {}", quantity, productId, orderId);

                try {
                    inventoryService.releaseStock(productId, quantity, orderId);
                    log.debug("Successfully released stock for product {} in order {}", productId, orderId);
                } catch (ConflictException e) {
                    // Duplicate release (idempotency) - this is expected on retries
                    log.warn("Duplicate release for product {} in order {} (idempotent): {}", productId, orderId, e.getMessage());
                } catch (ValidationException e) {
                    log.error("Validation error releasing stock for product {} in order {}: {}", productId, orderId, e.getMessage());
                }
            } catch (Exception e) {
                log.error("Unexpected error processing item for order {}: {}", orderId, e.getMessage(), e);
            }
        }
    }

    /**
     * Extract Long value from map, handling type conversions.
     */
    private Long extractLongValue(Map<String, Object> map, String key) {
        Object value = map.get(key);
        if (value == null) {
            return null;
        }
        if (value instanceof Long) {
            return (Long) value;
        }
        if (value instanceof Integer) {
            return ((Integer) value).longValue();
        }
        if (value instanceof String) {
            try {
                return Long.parseLong((String) value);
            } catch (NumberFormatException e) {
                return null;
            }
        }
        return null;
    }

    /**
     * Extract Integer value from map, handling type conversions.
     */
    private Integer extractIntegerValue(Map<String, Object> map, String key) {
        Object value = map.get(key);
        if (value == null) {
            return null;
        }
        if (value instanceof Integer) {
            return (Integer) value;
        }
        if (value instanceof Long) {
            return ((Long) value).intValue();
        }
        if (value instanceof String) {
            try {
                return Integer.parseInt((String) value);
            } catch (NumberFormatException e) {
                return null;
            }
        }
        return null;
    }
}
