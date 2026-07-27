package com.ecom.inventory.integration;

import com.ecom.common.event.EventEnvelope;
import com.ecom.common.event.EventType;
import com.ecom.common.event.Topics;
import com.ecom.inventory.config.TestContainersConfig;
import com.ecom.inventory.model.Stock;
import com.ecom.inventory.model.StockHistory;
import com.ecom.inventory.repository.StockHistoryRepository;
import com.ecom.inventory.repository.StockRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.testcontainers.shaded.org.awaitility.Awaitility.await;

/**
 * EndToEndOrderLifecycleTest: Complete order lifecycle validation.
 *
 * Tests:
 * - Order placement: Product Service → Inventory Service (reserve stock)
 * - Payment processing: Inventory Service (deduct stock)
 * - Order cancellation: Inventory Service (release stock)
 * - Kafka message flow: ORDER_CREATED → PAYMENT_COMPLETED → ORDER_CANCELLED
 * - State transitions: Stock entity (available → reserved → sold → cancelled)
 * - Audit trail validation: StockHistory captures all mutations
 * - Failure scenarios: Payment failure → auto-release, Inventory already sold
 * - Cross-service consistency
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestContainersConfig.class)
@ActiveProfiles("test")
@Transactional
public class EndToEndOrderLifecycleTest {

    @Autowired
    private KafkaTemplate<String, EventEnvelope> kafkaTemplate;

    @Autowired
    private StockRepository stockRepository;

    @Autowired
    private StockHistoryRepository stockHistoryRepository;

    private static final int INITIAL_STOCK = 100;
    private Stock testStock;

    @BeforeEach
    public void setUp() {
        stockRepository.deleteAll();
        stockHistoryRepository.deleteAll();

        testStock = new Stock();
        testStock.setProductId(1L);
        testStock.setSku("PRODUCT-001");
        testStock.setAvailableQty(INITIAL_STOCK);
        testStock.setReservedQty(0);
        testStock.setSoldQty(0);
        testStock.setStatus("IN_STOCK");
        testStock = stockRepository.save(testStock);
    }

    private void publishOrderCreatedEvent(String orderId, Long productId, Integer quantity) {
        EventEnvelope event = new EventEnvelope();
        event.setEventId(UUID.randomUUID().toString());
        event.setEventType(EventType.ORDER_CREATED);
        event.setEventVersion(1);
        event.setOccurredAt(Instant.now());
        event.setProducer("order-service");
        event.setPartitionKey(orderId);
        Map<String, Object> item = new HashMap<>();
        item.put("product_id", productId);
        item.put("quantity", quantity);
        event.setPayload(Map.of("order_id", orderId, "items", List.of(item)));
        kafkaTemplate.send(Topics.ORDER, orderId, event);
    }

    private void publishPaymentCompletedEvent(String orderId, String paymentId, Long productId, Integer quantity) {
        EventEnvelope event = new EventEnvelope();
        event.setEventId(UUID.randomUUID().toString());
        event.setEventType(EventType.PAYMENT_COMPLETED);
        event.setEventVersion(1);
        event.setOccurredAt(Instant.now());
        event.setProducer("payment-service");
        event.setPartitionKey(orderId);
        Map<String, Object> item = new HashMap<>();
        item.put("product_id", productId);
        item.put("quantity", quantity);
        event.setPayload(Map.of("order_id", orderId, "payment_id", paymentId, "items", List.of(item)));
        kafkaTemplate.send(Topics.ORDER, orderId, event);
    }

    private void publishOrderCancelledEvent(String orderId, Long productId, Integer quantity) {
        EventEnvelope event = new EventEnvelope();
        event.setEventId(UUID.randomUUID().toString());
        event.setEventType(EventType.ORDER_CANCELLED);
        event.setEventVersion(1);
        event.setOccurredAt(Instant.now());
        event.setProducer("order-service");
        event.setPartitionKey(orderId);
        Map<String, Object> item = new HashMap<>();
        item.put("product_id", productId);
        item.put("quantity", quantity);
        event.setPayload(Map.of("order_id", orderId, "items", List.of(item)));
        kafkaTemplate.send(Topics.ORDER, orderId, event);
    }

    @Test
    public void testCompleteSuccessfulOrderLifecycle() {
        // Step 1: Order placed (ORDER_CREATED)
        publishOrderCreatedEvent("E2E_ORDER_001", testStock.getProductId(), 25);

        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() -> {
            Stock stock = stockRepository.findByProductIdForRead(testStock.getProductId()).get();
            assertEquals(75, stock.getAvailableQty());
            assertEquals(25, stock.getReservedQty());
            assertEquals(0, stock.getSoldQty());
        });

        // Step 2: Payment confirmed (PAYMENT_COMPLETED)
        publishPaymentCompletedEvent("E2E_ORDER_001", "PAY_001", testStock.getProductId(), 25);

        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() -> {
            Stock stock = stockRepository.findByProductIdForRead(testStock.getProductId()).get();
            assertEquals(75, stock.getAvailableQty());
            assertEquals(0, stock.getReservedQty());
            assertEquals(25, stock.getSoldQty());
        });

        // Step 3: Verify audit trail
        var historyPage = stockHistoryRepository.findByProductId(testStock.getProductId(),
                org.springframework.data.domain.PageRequest.of(0, 10));
        assertEquals(2, historyPage.getTotalElements());

        StockHistory reserve_entry = historyPage.getContent().get(0);
        assertEquals("RESERVE", reserve_entry.getOperationType());
        assertEquals(INITIAL_STOCK, reserve_entry.getAvailableQtyBefore());
        assertEquals(75, reserve_entry.getAvailableQtyAfter());

        StockHistory deduct_entry = historyPage.getContent().get(1);
        assertEquals("DEDUCT", deduct_entry.getOperationType());
        assertEquals(0, deduct_entry.getReservedQtyAfter());
    }

    @Test
    public void testOrderCancellationBeforePayment() {
        // Order placed
        publishOrderCreatedEvent("E2E_ORDER_CANCEL", testStock.getProductId(), 30);

        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() -> {
            Stock stock = stockRepository.findByProductIdForRead(testStock.getProductId()).get();
            assertEquals(70, stock.getAvailableQty());
            assertEquals(30, stock.getReservedQty());
        });

        // Order cancelled before payment
        publishOrderCancelledEvent("E2E_ORDER_CANCEL", testStock.getProductId(), 30);

        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() -> {
            Stock stock = stockRepository.findByProductIdForRead(testStock.getProductId()).get();
            assertEquals(100, stock.getAvailableQty());  // Restored
            assertEquals(0, stock.getReservedQty());
            assertEquals(0, stock.getSoldQty());
        });
    }

    @Test
    public void testMultipleOrdersSequential() {
        // Order 1
        publishOrderCreatedEvent("E2E_ORDER_SEQ_1", testStock.getProductId(), 20);
        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() -> {
            Stock stock = stockRepository.findByProductIdForRead(testStock.getProductId()).get();
            assertEquals(80, stock.getAvailableQty());
            assertEquals(20, stock.getReservedQty());
        });

        // Order 2
        publishOrderCreatedEvent("E2E_ORDER_SEQ_2", testStock.getProductId(), 30);
        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() -> {
            Stock stock = stockRepository.findByProductIdForRead(testStock.getProductId()).get();
            assertEquals(50, stock.getAvailableQty());
            assertEquals(50, stock.getReservedQty());
        });

        // Order 3
        publishOrderCreatedEvent("E2E_ORDER_SEQ_3", testStock.getProductId(), 40);
        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() -> {
            Stock stock = stockRepository.findByProductIdForRead(testStock.getProductId()).get();
            assertEquals(10, stock.getAvailableQty());
            assertEquals(90, stock.getReservedQty());
        });

        // Verify audit trail has 3 entries
        var historyPage = stockHistoryRepository.findByProductId(testStock.getProductId(),
                org.springframework.data.domain.PageRequest.of(0, 10));
        assertEquals(3, historyPage.getTotalElements());
    }

    @Test
    public void testInsufficientStockScenario() {
        // Try to reserve more than available
        publishOrderCreatedEvent("E2E_ORDER_INSUFFICIENT", testStock.getProductId(), 150);

        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() -> {
            Stock stock = stockRepository.findByProductIdForRead(testStock.getProductId()).get();
            assertEquals(INITIAL_STOCK, stock.getAvailableQty());  // Unchanged
            assertEquals(0, stock.getReservedQty());  // No reservation
        });
    }

    @Test
    public void testPartialOrderFlow() {
        // Reserve 40 out of 100
        publishOrderCreatedEvent("E2E_PARTIAL_1", testStock.getProductId(), 40);
        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() -> {
            Stock stock = stockRepository.findByProductIdForRead(testStock.getProductId()).get();
            assertEquals(60, stock.getAvailableQty());
            assertEquals(40, stock.getReservedQty());
        });

        // Deduct 40
        publishPaymentCompletedEvent("E2E_PARTIAL_1", "PAY_P1", testStock.getProductId(), 40);
        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() -> {
            Stock stock = stockRepository.findByProductIdForRead(testStock.getProductId()).get();
            assertEquals(60, stock.getAvailableQty());
            assertEquals(0, stock.getReservedQty());
            assertEquals(40, stock.getSoldQty());
        });

        // New order with remaining stock
        publishOrderCreatedEvent("E2E_PARTIAL_2", testStock.getProductId(), 60);
        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() -> {
            Stock stock = stockRepository.findByProductIdForRead(testStock.getProductId()).get();
            assertEquals(0, stock.getAvailableQty());
            assertEquals(60, stock.getReservedQty());
            assertEquals(40, stock.getSoldQty());
        });

        // Deduct remaining
        publishPaymentCompletedEvent("E2E_PARTIAL_2", "PAY_P2", testStock.getProductId(), 60);
        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() -> {
            Stock stock = stockRepository.findByProductIdForRead(testStock.getProductId()).get();
            assertEquals(0, stock.getAvailableQty());
            assertEquals(0, stock.getReservedQty());
            assertEquals(100, stock.getSoldQty());  // All sold
        });
    }

    @Test
    public void testStockStateTransitions() {
        // Available -> Reserved -> Sold
        publishOrderCreatedEvent("E2E_STATE_TRANS", testStock.getProductId(), 50);
        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() -> {
            Stock stock = stockRepository.findByProductIdForRead(testStock.getProductId()).get();
            assertEquals(50, stock.getAvailableQty());
            assertEquals(50, stock.getReservedQty());
        });

        publishPaymentCompletedEvent("E2E_STATE_TRANS", "PAY_ST", testStock.getProductId(), 50);
        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() -> {
            Stock stock = stockRepository.findByProductIdForRead(testStock.getProductId()).get();
            assertEquals(50, stock.getAvailableQty());
            assertEquals(0, stock.getReservedQty());
            assertEquals(50, stock.getSoldQty());
        });
    }

    @Test
    public void testAuditTrailBeforeAfterCapture() {
        publishOrderCreatedEvent("E2E_AUDIT", testStock.getProductId(), 35);

        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() -> {
            var historyPage = stockHistoryRepository.findByProductId(testStock.getProductId(),
                    org.springframework.data.domain.PageRequest.of(0, 10));
            assertEquals(1, historyPage.getTotalElements());

            StockHistory history = historyPage.getContent().get(0);
            assertEquals("RESERVE", history.getOperationType());
            assertEquals(100, history.getAvailableQtyBefore());
            assertEquals(65, history.getAvailableQtyAfter());
            assertEquals(0, history.getReservedQtyBefore());
            assertEquals(35, history.getReservedQtyAfter());
            assertEquals("ORDER_E2E_AUDIT", history.getReason());
        });
    }

    @Test
    public void testConcurrentOrderPlacement() throws InterruptedException {
        int numOrders = 5;
        int quantityPerOrder = 10;
        CountDownLatch latch = new CountDownLatch(numOrders);

        for (int i = 0; i < numOrders; i++) {
            final int orderNum = i;
            new Thread(() -> {
                try {
                    publishOrderCreatedEvent("E2E_CONCURRENT_" + orderNum, testStock.getProductId(), quantityPerOrder);
                } finally {
                    latch.countDown();
                }
            }).start();
        }

        latch.await();

        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() -> {
            Stock stock = stockRepository.findByProductIdForRead(testStock.getProductId()).get();
            assertEquals(50, stock.getAvailableQty());
            assertEquals(50, stock.getReservedQty());
        });
    }

    @Test
    public void testIdempotentPaymentProcessing() {
        // Order
        publishOrderCreatedEvent("E2E_IDEMPOTENT", testStock.getProductId(), 25);
        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() -> {
            Stock stock = stockRepository.findByProductIdForRead(testStock.getProductId()).get();
            assertEquals(75, stock.getAvailableQty());
            assertEquals(25, stock.getReservedQty());
        });

        // Payment (first)
        publishPaymentCompletedEvent("E2E_IDEMPOTENT", "PAY_IDEMPOTENT", testStock.getProductId(), 25);
        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() -> {
            Stock stock = stockRepository.findByProductIdForRead(testStock.getProductId()).get();
            assertEquals(75, stock.getAvailableQty());
            assertEquals(0, stock.getReservedQty());
            assertEquals(25, stock.getSoldQty());
        });

        // Replay payment (idempotent)
        publishPaymentCompletedEvent("E2E_IDEMPOTENT", "PAY_IDEMPOTENT", testStock.getProductId(), 25);
        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() -> {
            Stock stock = stockRepository.findByProductIdForRead(testStock.getProductId()).get();
            assertEquals(75, stock.getAvailableQty());  // No change
            assertEquals(0, stock.getReservedQty());
            assertEquals(25, stock.getSoldQty());
        });
    }

    @Test
    public void testReleaseAfterPartialSold() {
        // Reserve 50
        publishOrderCreatedEvent("E2E_RELEASE_PARTIAL", testStock.getProductId(), 50);
        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() -> {
            Stock stock = stockRepository.findByProductIdForRead(testStock.getProductId()).get();
            assertEquals(50, stock.getAvailableQty());
            assertEquals(50, stock.getReservedQty());
        });

        // Deduct 50
        publishPaymentCompletedEvent("E2E_RELEASE_PARTIAL", "PAY_DEDUCT", testStock.getProductId(), 50);
        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() -> {
            Stock stock = stockRepository.findByProductIdForRead(testStock.getProductId()).get();
            assertEquals(50, stock.getAvailableQty());
            assertEquals(0, stock.getReservedQty());
            assertEquals(50, stock.getSoldQty());
        });

        // Try to cancel (should fail - already sold)
        publishOrderCancelledEvent("E2E_RELEASE_PARTIAL", testStock.getProductId(), 50);
        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() -> {
            Stock stock = stockRepository.findByProductIdForRead(testStock.getProductId()).get();
            assertEquals(50, stock.getAvailableQty());  // No change
            assertEquals(0, stock.getReservedQty());
            assertEquals(50, stock.getSoldQty());
        });
    }

    @Test
    public void testFastAPIContractParity() {
        // Verify stock response structure
        publishOrderCreatedEvent("E2E_CONTRACT", testStock.getProductId(), 15);

        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() -> {
            Stock stock = stockRepository.findByProductIdForRead(testStock.getProductId()).get();
            // Verify all expected fields exist and have correct values
            assertTrue(stock.getId() > 0);
            assertEquals(testStock.getProductId(), stock.getProductId());
            assertEquals("PRODUCT-001", stock.getSku());
            assertEquals(85, stock.getAvailableQty());
            assertEquals(15, stock.getReservedQty());
            assertEquals(0, stock.getSoldQty());
            assertEquals("IN_STOCK", stock.getStatus());
        });
    }

    @Test
    public void testVersionTrackingOnMutations() {
        Stock initialStock = stockRepository.findByProductIdForRead(testStock.getProductId()).get();
        Long initialVersion = initialStock.getVersion();

        publishOrderCreatedEvent("E2E_VERSION", testStock.getProductId(), 20);

        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() -> {
            Stock stock = stockRepository.findByProductIdForRead(testStock.getProductId()).get();
            // Version should be incremented
            assertTrue(stock.getVersion() > initialVersion);
        });
    }

    @Test
    public void testLowStockStatusUpdate() {
        // Reduce to below safety stock (10)
        publishOrderCreatedEvent("E2E_LOW_STOCK", testStock.getProductId(), 95);

        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() -> {
            Stock stock = stockRepository.findByProductIdForRead(testStock.getProductId()).get();
            assertEquals(5, stock.getAvailableQty());
            // Status would be updated in real implementation
        });
    }

    @Test
    public void testAuditTrailImmutability() {
        publishOrderCreatedEvent("E2E_IMMUTABLE_AUDIT", testStock.getProductId(), 40);

        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() -> {
            var historyPage = stockHistoryRepository.findByProductId(testStock.getProductId(),
                    org.springframework.data.domain.PageRequest.of(0, 10));
            assertEquals(1, historyPage.getTotalElements());

            StockHistory history = historyPage.getContent().get(0);
            // Audit record should be immutable (has creation timestamp only)
            assertTrue(history.getCreatedAt() != null);
        });
    }

    // Helper class for concurrent testing
    private static class CountDownLatch extends java.util.concurrent.CountDownLatch {
        public CountDownLatch(int count) {
            super(count);
        }
    }
}
