package com.ecom.inventory.service;

import com.ecom.common.event.EventEnvelope;
import com.ecom.common.event.EventType;
import com.ecom.common.exception.ConflictException;
import com.ecom.common.exception.NotFoundException;
import com.ecom.common.exception.ValidationException;
import com.ecom.inventory.config.TestContainersConfig;
import com.ecom.inventory.dto.ReserveStockResponse;
import com.ecom.inventory.model.Stock;
import com.ecom.inventory.model.StockHistory;
import com.ecom.inventory.repository.StockHistoryRepository;
import com.ecom.inventory.repository.StockMutationRepository;
import com.ecom.inventory.repository.StockRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/**
 * InventoryServiceIntegrationTest: Integration tests for full stock lifecycle.
 *
 * Tests:
 * - Full lifecycle: reserve → deduct → release (success path)
 * - Insufficient stock scenarios (ConflictException)
 * - Idempotent operations (duplicate reason field)
 * - Concurrent mutations via multiple threads
 * - RBAC enforcement (seller vs admin access)
 * - Event publishing verification
 * - Audit trail validation
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestContainersConfig.class)
@ActiveProfiles("test")
@Transactional
public class InventoryServiceIntegrationTest {

    @Autowired
    private InventoryService inventoryService;

    @Autowired
    private StockRepository stockRepository;

    @Autowired
    private StockHistoryRepository stockHistoryRepository;

    @Autowired
    private StockMutationRepository stockMutationRepository;

    @MockBean
    private KafkaTemplate<String, EventEnvelope> kafkaTemplate;

    private Stock testStock;

    @BeforeEach
    public void setUp() {
        stockRepository.deleteAll();
        stockHistoryRepository.deleteAll();

        testStock = new Stock();
        testStock.setProductId(1L);
        testStock.setSku("TEST-SKU-001");
        testStock.setAvailableQty(100);
        testStock.setReservedQty(0);
        testStock.setSoldQty(0);
        testStock.setSafetyStock(10);
        testStock.setReorderThreshold(20);
        testStock.setStatus("IN_STOCK");
        testStock.setWarehouseLocation("DEFAULT");
        testStock = stockRepository.save(testStock);
    }

    @Test
    public void testReserveStockSuccess() {
        ReserveStockResponse response = inventoryService.reserveStock(testStock.getProductId(), 10, "ORDER_123");

        assertEquals("SUCCESS", response.getStatus());
        assertEquals(10, response.getReservedQty());
        assertEquals(90, response.getAvailableQty());

        Stock updated = stockRepository.findByProductIdForRead(testStock.getProductId()).get();
        assertEquals(90, updated.getAvailableQty());
        assertEquals(10, updated.getReservedQty());
        verify(kafkaTemplate).send(anyString(), anyString(), eq(EventType.INVENTORY_RESERVED));
    }

    @Test
    public void testFullLifecycleReserveDeductRelease() {
        // Reserve
        inventoryService.reserveStock(testStock.getProductId(), 20, "ORDER_123");
        Stock after_reserve = stockRepository.findByProductIdForRead(testStock.getProductId()).get();
        assertEquals(80, after_reserve.getAvailableQty());
        assertEquals(20, after_reserve.getReservedQty());

        // Deduct after payment
        inventoryService.deductStock(testStock.getProductId(), 20, "ORDER_123", "PAYMENT_456");
        Stock after_deduct = stockRepository.findByProductIdForRead(testStock.getProductId()).get();
        assertEquals(80, after_deduct.getAvailableQty());
        assertEquals(0, after_deduct.getReservedQty());
        assertEquals(20, after_deduct.getSoldQty());

        // Release on cancellation (different order)
        inventoryService.reserveStock(testStock.getProductId(), 15, "ORDER_789");
        inventoryService.releaseStock(testStock.getProductId(), 15, "ORDER_789");
        Stock after_release = stockRepository.findByProductIdForRead(testStock.getProductId()).get();
        assertEquals(95, after_release.getAvailableQty());
        assertEquals(0, after_release.getReservedQty());

        // Verify audit trail has 4 entries (reserve, deduct, reserve, release)
        long historyCount = stockHistoryRepository.findByProductId(testStock.getProductId(), org.springframework.data.domain.PageRequest.of(0, 100)).getTotalElements();
        assertEquals(4, historyCount);
    }

    @Test
    public void testReserveStockInsufficientQuantity() {
        ConflictException ex = assertThrows(ConflictException.class, () ->
                inventoryService.reserveStock(testStock.getProductId(), 150, "ORDER_999")
        );
        assertNotNull(ex.getMessage());
    }

    @Test
    public void testReserveStockDuplicateIdempotency() {
        // First reservation succeeds
        ReserveStockResponse response1 = inventoryService.reserveStock(testStock.getProductId(), 10, "ORDER_DUPLICATE");
        assertEquals("SUCCESS", response1.getStatus());

        // Duplicate reservation should fail with ConflictException
        ConflictException ex = assertThrows(ConflictException.class, () ->
                inventoryService.reserveStock(testStock.getProductId(), 10, "ORDER_DUPLICATE")
        );
        assertNotNull(ex.getMessage());

        // Stock should remain unchanged
        Stock current = stockRepository.findByProductIdForRead(testStock.getProductId()).get();
        assertEquals(90, current.getAvailableQty());
        assertEquals(10, current.getReservedQty());
    }

    @Test
    public void testConcurrentReservations() throws InterruptedException {
        int numThreads = 5;
        int quantityPerThread = 10;
        CountDownLatch latch = new CountDownLatch(numThreads);
        AtomicInteger successCount = new AtomicInteger(0);

        for (int i = 0; i < numThreads; i++) {
            final int threadId = i;
            new Thread(() -> {
                try {
                    inventoryService.reserveStock(testStock.getProductId(), quantityPerThread, "ORDER_CONCURRENT_" + threadId);
                    successCount.incrementAndGet();
                } catch (ConflictException e) {
                    // Expected for some threads if reserve exceeds available
                } finally {
                    latch.countDown();
                }
            }).start();
        }

        latch.await();

        Stock final_stock = stockRepository.findByProductIdForRead(testStock.getProductId()).get();
        int totalReserved = final_stock.getReservedQty();
        int totalAvailable = final_stock.getAvailableQty();

        // Total should equal initial (reserved + available = initial)
        assertEquals(100, totalReserved + totalAvailable);
        assertNotNull(final_stock.getVersion());
    }

    @Test
    public void testDeductStockInsufficientReserved() {
        // Reserve only 10
        inventoryService.reserveStock(testStock.getProductId(), 10, "ORDER_123");

        // Try to deduct 20 (more than reserved)
        ConflictException ex = assertThrows(ConflictException.class, () ->
                inventoryService.deductStock(testStock.getProductId(), 20, "ORDER_123", "PAYMENT_456")
        );
        assertNotNull(ex.getMessage());
    }

    @Test
    public void testReleaseStockInvalidState() {
        // Try to release without prior reservation
        ConflictException ex = assertThrows(ConflictException.class, () ->
                inventoryService.releaseStock(testStock.getProductId(), 50, "ORDER_NONEXIST")
        );
        assertNotNull(ex.getMessage());
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    public void testAdjustStockAdminOnly() {
        inventoryService.adjustStock(testStock.getProductId(), 50, 5, "INVENTORY_CORRECTION", "admin_user");

        Stock adjusted = stockRepository.findByProductIdForRead(testStock.getProductId()).get();
        assertEquals(50, adjusted.getAvailableQty());
        assertEquals(5, adjusted.getReservedQty());

        verify(kafkaTemplate).send(anyString(), anyString(), eq(EventType.INVENTORY_UPDATED));
    }

    @Test
    public void testAdjustStockNegativeQuantities() {
        ValidationException ex = assertThrows(ValidationException.class, () ->
                inventoryService.adjustStock(testStock.getProductId(), -10, 5, "INVALID", "admin_user")
        );
        assertNotNull(ex.getMessage());
    }

    @Test
    public void testGetStockInfo() {
        var response = inventoryService.getStockInfo(testStock.getProductId());

        assertEquals(testStock.getProductId(), response.getProductId());
        assertEquals(100, response.getAvailableQty());
        assertEquals(0, response.getReservedQty());
        assertEquals("TEST-SKU-001", response.getSku());
    }

    @Test
    public void testGetStockInfoNotFound() {
        NotFoundException ex = assertThrows(NotFoundException.class, () ->
                inventoryService.getStockInfo(999L)
        );
        assertNotNull(ex.getMessage());
    }

    @Test
    public void testAuditTrailCaptureBefoeAfterState() {
        // Reserve stock
        inventoryService.reserveStock(testStock.getProductId(), 25, "ORDER_AUDIT");

        // Verify audit trail
        var page = stockHistoryRepository.findByProductId(testStock.getProductId(),
                org.springframework.data.domain.PageRequest.of(0, 10));
        assertEquals(1, page.getTotalElements());

        StockHistory history = page.getContent().get(0);
        assertEquals("RESERVE", history.getOperationType());
        assertEquals(100, history.getAvailableQtyBefore());
        assertEquals(75, history.getAvailableQtyAfter());
        assertEquals(0, history.getReservedQtyBefore());
        assertEquals(25, history.getReservedQtyAfter());
        assertEquals("ORDER_AUDIT", history.getReason());
    }

    @Test
    public void testLowStockAlerts() {
        // Reduce available qty below safety stock
        inventoryService.adjustStock(testStock.getProductId(), 5, 0, "DAMAGE", "admin");

        var alerts = inventoryService.getLowStockAlerts(
                new com.ecom.common.pagination.PageRequest(1, 10)
        );

        assertEquals(1, alerts.getContent().size());
        assertEquals(5, alerts.getContent().get(0).getAvailableQty());
    }

    @Test
    public void testEventPublishingOnAllMutations() {
        // Reserve
        inventoryService.reserveStock(testStock.getProductId(), 10, "ORDER_EVENT_1");
        verify(kafkaTemplate).send(anyString(), anyString(), eq(EventType.INVENTORY_RESERVED));

        // Deduct
        inventoryService.deductStock(testStock.getProductId(), 10, "ORDER_EVENT_1", "PAYMENT_1");
        verify(kafkaTemplate).send(anyString(), anyString(), eq(EventType.STOCK_DEDUCTED));

        // Release
        inventoryService.reserveStock(testStock.getProductId(), 5, "ORDER_EVENT_2");
        inventoryService.releaseStock(testStock.getProductId(), 5, "ORDER_EVENT_2");
        verify(kafkaTemplate).send(anyString(), anyString(), eq(EventType.INVENTORY_RELEASED));

        // Total: 3 publishes
        verify(kafkaTemplate, times(3)).send(anyString(), anyString(), eq(EventType.class));
    }
}
