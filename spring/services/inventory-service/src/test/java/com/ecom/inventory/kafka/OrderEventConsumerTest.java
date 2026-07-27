package com.ecom.inventory.kafka;

import com.ecom.common.event.EventEnvelope;
import com.ecom.common.event.EventType;
import com.ecom.common.exception.ConflictException;
import com.ecom.common.exception.ValidationException;
import com.ecom.inventory.service.InventoryService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.doThrow;

/**
 * OrderEventConsumerTest: Kafka consumer tests.
 *
 * Tests:
 * - ORDER_CREATED: Reserve stock for each item
 * - PAYMENT_COMPLETED: Deduct stock after payment
 * - ORDER_CANCELLED: Release reserved stock
 * - Idempotency handling (duplicate messages)
 * - Error handling (invalid messages, service errors)
 * - Batch processing
 */
@ExtendWith(MockitoExtension.class)
@ActiveProfiles("test")
public class OrderEventConsumerTest {

    private OrderEventConsumer orderEventConsumer;

    @Mock
    private InventoryService inventoryService;

    @BeforeEach
    public void setUp() {
        orderEventConsumer = new OrderEventConsumer(inventoryService);
    }

    /**
     * Test 1: Handle ORDER_CREATED event with valid items.
     */
    @Test
    public void testHandleOrderCreatedSuccess() {
        String orderId = "ORDER_123";

        Map<String, Object> item1 = new HashMap<>();
        item1.put("product_id", 1L);
        item1.put("quantity", 5);

        Map<String, Object> item2 = new HashMap<>();
        item2.put("product_id", 2L);
        item2.put("quantity", 3);

        EventEnvelope event = new EventEnvelope();
        event.setEventId(UUID.randomUUID().toString());
        event.setEventType(EventType.ORDER_CREATED);
        event.setEventVersion(1);
        event.setOccurredAt(Instant.now());
        event.setProducer("order-service");
        event.setPayload(Map.of(
                "order_id", orderId,
                "items", List.of(item1, item2)
        ));

        orderEventConsumer.handleOrderEvents(List.of(event));

        verify(inventoryService, times(2)).reserveStock(anyLong(), anyInt(), anyString());
        verify(inventoryService).reserveStock(1L, 5, orderId);
        verify(inventoryService).reserveStock(2L, 3, orderId);
    }

    /**
     * Test 2: Handle ORDER_CREATED with duplicate (idempotency).
     */
    @Test
    public void testHandleOrderCreatedDuplicate() {
        String orderId = "ORDER_123";

        Map<String, Object> item = new HashMap<>();
        item.put("product_id", 1L);
        item.put("quantity", 5);

        EventEnvelope event = new EventEnvelope();
        event.setEventId(UUID.randomUUID().toString());
        event.setEventType(EventType.ORDER_CREATED);
        event.setEventVersion(1);
        event.setOccurredAt(Instant.now());
        event.setProducer("order-service");
        event.setPayload(Map.of(
                "order_id", orderId,
                "items", List.of(item)
        ));

        // First call succeeds
        doThrow(new ConflictException("Duplicate reservation"))
                .when(inventoryService).reserveStock(anyLong(), anyInt(), anyString());

        // Should handle gracefully (log and continue)
        orderEventConsumer.handleOrderEvents(List.of(event));

        verify(inventoryService).reserveStock(1L, 5, orderId);
    }

    /**
     * Test 3: Handle ORDER_CREATED with insufficient stock.
     */
    @Test
    public void testHandleOrderCreatedInsufficientStock() {
        String orderId = "ORDER_123";

        Map<String, Object> item = new HashMap<>();
        item.put("product_id", 1L);
        item.put("quantity", 1000);

        EventEnvelope event = new EventEnvelope();
        event.setEventId(UUID.randomUUID().toString());
        event.setEventType(EventType.ORDER_CREATED);
        event.setEventVersion(1);
        event.setOccurredAt(Instant.now());
        event.setProducer("order-service");
        event.setPayload(Map.of(
                "order_id", orderId,
                "items", List.of(item)
        ));

        doThrow(new ConflictException("Insufficient stock"))
                .when(inventoryService).reserveStock(anyLong(), anyInt(), anyString());

        // Should handle gracefully (log and continue)
        orderEventConsumer.handleOrderEvents(List.of(event));

        verify(inventoryService).reserveStock(1L, 1000, orderId);
    }

    /**
     * Test 4: Handle ORDER_CREATED with missing order_id.
     */
    @Test
    public void testHandleOrderCreatedMissingOrderId() {
        Map<String, Object> item = new HashMap<>();
        item.put("product_id", 1L);
        item.put("quantity", 5);

        EventEnvelope event = new EventEnvelope();
        event.setEventId(UUID.randomUUID().toString());
        event.setEventType(EventType.ORDER_CREATED);
        event.setEventVersion(1);
        event.setOccurredAt(Instant.now());
        event.setProducer("order-service");
        event.setPayload(Map.of(
                "items", List.of(item)
                // Missing order_id
        ));

        orderEventConsumer.handleOrderEvents(List.of(event));

        // Should skip without calling service
        verify(inventoryService, never()).reserveStock(anyLong(), anyInt(), anyString());
    }

    /**
     * Test 5: Handle ORDER_CREATED with empty items list.
     */
    @Test
    public void testHandleOrderCreatedEmptyItems() {
        String orderId = "ORDER_123";

        EventEnvelope event = new EventEnvelope();
        event.setEventId(UUID.randomUUID().toString());
        event.setEventType(EventType.ORDER_CREATED);
        event.setEventVersion(1);
        event.setOccurredAt(Instant.now());
        event.setProducer("order-service");
        event.setPayload(Map.of(
                "order_id", orderId,
                "items", List.of()
        ));

        orderEventConsumer.handleOrderEvents(List.of(event));

        // Should skip without calling service
        verify(inventoryService, never()).reserveStock(anyLong(), anyInt(), anyString());
    }

    /**
     * Test 6: Handle PAYMENT_COMPLETED event.
     */
    @Test
    public void testHandlePaymentCompletedSuccess() {
        String orderId = "ORDER_123";
        String paymentId = "PAYMENT_456";

        Map<String, Object> item = new HashMap<>();
        item.put("product_id", 1L);
        item.put("quantity", 5);

        EventEnvelope event = new EventEnvelope();
        event.setEventId(UUID.randomUUID().toString());
        event.setEventType(EventType.PAYMENT_COMPLETED);
        event.setEventVersion(1);
        event.setOccurredAt(Instant.now());
        event.setProducer("payment-service");
        event.setPayload(Map.of(
                "order_id", orderId,
                "payment_id", paymentId,
                "items", List.of(item)
        ));

        orderEventConsumer.handleOrderEvents(List.of(event));

        verify(inventoryService).deductStock(1L, 5, orderId, paymentId);
    }

    /**
     * Test 7: Handle ORDER_CANCELLED event.
     */
    @Test
    public void testHandleOrderCancelledSuccess() {
        String orderId = "ORDER_123";

        Map<String, Object> item = new HashMap<>();
        item.put("product_id", 1L);
        item.put("quantity", 5);

        EventEnvelope event = new EventEnvelope();
        event.setEventId(UUID.randomUUID().toString());
        event.setEventType(EventType.ORDER_CANCELLED);
        event.setEventVersion(1);
        event.setOccurredAt(Instant.now());
        event.setProducer("order-service");
        event.setPayload(Map.of(
                "order_id", orderId,
                "items", List.of(item)
        ));

        orderEventConsumer.handleOrderEvents(List.of(event));

        verify(inventoryService).releaseStock(1L, 5, orderId);
    }

    /**
     * Test 8: Batch processing with multiple events.
     */
    @Test
    public void testBatchProcessing() {
        // First event: ORDER_CREATED
        Map<String, Object> item1 = new HashMap<>();
        item1.put("product_id", 1L);
        item1.put("quantity", 5);

        EventEnvelope event1 = new EventEnvelope();
        event1.setEventId(UUID.randomUUID().toString());
        event1.setEventType(EventType.ORDER_CREATED);
        event1.setOccurredAt(Instant.now());
        event1.setProducer("order-service");
        event1.setPayload(Map.of("order_id", "ORDER_123", "items", List.of(item1)));

        // Second event: PAYMENT_COMPLETED
        Map<String, Object> item2 = new HashMap<>();
        item2.put("product_id", 1L);
        item2.put("quantity", 5);

        EventEnvelope event2 = new EventEnvelope();
        event2.setEventId(UUID.randomUUID().toString());
        event2.setEventType(EventType.PAYMENT_COMPLETED);
        event2.setOccurredAt(Instant.now());
        event2.setProducer("payment-service");
        event2.setPayload(Map.of(
                "order_id", "ORDER_123",
                "payment_id", "PAYMENT_456",
                "items", List.of(item2)
        ));

        orderEventConsumer.handleOrderEvents(List.of(event1, event2));

        verify(inventoryService).reserveStock(1L, 5, "ORDER_123");
        verify(inventoryService).deductStock(1L, 5, "ORDER_123", "PAYMENT_456");
    }

    /**
     * Test 9: Ignore unknown event types.
     */
    @Test
    public void testIgnoreUnknownEventType() {
        EventEnvelope event = new EventEnvelope();
        event.setEventId(UUID.randomUUID().toString());
        event.setEventType("UnknownEvent");
        event.setOccurredAt(Instant.now());
        event.setProducer("unknown-service");
        event.setPayload(Map.of());

        orderEventConsumer.handleOrderEvents(List.of(event));

        // Should not call service
        verify(inventoryService, never()).reserveStock(anyLong(), anyInt(), anyString());
        verify(inventoryService, never()).deductStock(anyLong(), anyInt(), anyString(), anyString());
        verify(inventoryService, never()).releaseStock(anyLong(), anyInt(), anyString());
    }

    /**
     * Test 10: Handle event with invalid item (missing product_id).
     */
    @Test
    public void testHandleOrderCreatedInvalidItem() {
        String orderId = "ORDER_123";

        Map<String, Object> item = new HashMap<>();
        item.put("quantity", 5);
        // Missing product_id

        EventEnvelope event = new EventEnvelope();
        event.setEventId(UUID.randomUUID().toString());
        event.setEventType(EventType.ORDER_CREATED);
        event.setOccurredAt(Instant.now());
        event.setProducer("order-service");
        event.setPayload(Map.of(
                "order_id", orderId,
                "items", List.of(item)
        ));

        orderEventConsumer.handleOrderEvents(List.of(event));

        // Should skip invalid item without calling service
        verify(inventoryService, never()).reserveStock(anyLong(), anyInt(), anyString());
    }

    /**
     * Test 11: Continue processing batch after error in one item.
     */
    @Test
    public void testBatchProcessingContinuesAfterError() {
        Map<String, Object> item1 = new HashMap<>();
        item1.put("product_id", 1L);
        item1.put("quantity", 1000); // Will fail

        Map<String, Object> item2 = new HashMap<>();
        item2.put("product_id", 2L);
        item2.put("quantity", 5); // Should succeed

        EventEnvelope event = new EventEnvelope();
        event.setEventId(UUID.randomUUID().toString());
        event.setEventType(EventType.ORDER_CREATED);
        event.setOccurredAt(Instant.now());
        event.setProducer("order-service");
        event.setPayload(Map.of(
                "order_id", "ORDER_123",
                "items", List.of(item1, item2)
        ));

        doThrow(new ConflictException("Insufficient stock"))
                .when(inventoryService).reserveStock(1L, 1000, "ORDER_123");

        orderEventConsumer.handleOrderEvents(List.of(event));

        // Should process second item despite first item's error
        verify(inventoryService).reserveStock(1L, 1000, "ORDER_123");
        verify(inventoryService).reserveStock(2L, 5, "ORDER_123");
    }

    /**
     * Test 12: Handle type conversion - Long productId from Integer.
     */
    @Test
    public void testTypeConversionIntegerProductId() {
        String orderId = "ORDER_123";

        Map<String, Object> item = new HashMap<>();
        item.put("product_id", 1); // Integer instead of Long
        item.put("quantity", 5);

        EventEnvelope event = new EventEnvelope();
        event.setEventId(UUID.randomUUID().toString());
        event.setEventType(EventType.ORDER_CREATED);
        event.setOccurredAt(Instant.now());
        event.setProducer("order-service");
        event.setPayload(Map.of(
                "order_id", orderId,
                "items", List.of(item)
        ));

        orderEventConsumer.handleOrderEvents(List.of(event));

        verify(inventoryService).reserveStock(1L, 5, orderId);
    }

    /**
     * Test 13: Handle type conversion - String productId from String.
     */
    @Test
    public void testTypeConversionStringProductId() {
        String orderId = "ORDER_123";

        Map<String, Object> item = new HashMap<>();
        item.put("product_id", "123"); // String
        item.put("quantity", 5);

        EventEnvelope event = new EventEnvelope();
        event.setEventId(UUID.randomUUID().toString());
        event.setEventType(EventType.ORDER_CREATED);
        event.setOccurredAt(Instant.now());
        event.setProducer("order-service");
        event.setPayload(Map.of(
                "order_id", orderId,
                "items", List.of(item)
        ));

        orderEventConsumer.handleOrderEvents(List.of(event));

        verify(inventoryService).reserveStock(123L, 5, orderId);
    }
}
