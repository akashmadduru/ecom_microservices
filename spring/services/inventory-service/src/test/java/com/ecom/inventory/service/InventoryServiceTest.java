package com.ecom.inventory.service;

import com.ecom.common.event.EventEnvelope;
import com.ecom.common.event.EventType;
import com.ecom.common.exception.ConflictException;
import com.ecom.common.exception.NotFoundException;
import com.ecom.common.exception.ValidationException;
import com.ecom.common.pagination.Page;
import com.ecom.common.pagination.PageRequest;
import com.ecom.inventory.dto.ReserveStockResponse;
import com.ecom.inventory.dto.StockPageResponse;
import com.ecom.inventory.dto.StockResponse;
import com.ecom.inventory.model.Stock;
import com.ecom.inventory.model.StockHistory;
import com.ecom.inventory.repository.StockHistoryRepository;
import com.ecom.inventory.repository.StockMutationRepository;
import com.ecom.inventory.repository.StockRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * InventoryServiceTest: Unit tests for inventory operations.
 *
 * Tests:
 * - Stock reservation (happy path, insufficient stock, duplicate)
 * - Stock deduction (happy path, insufficient reserved)
 * - Stock release (happy path, invalid state)
 * - Admin adjustments
 * - Stock info retrieval
 * - Audit trail queries
 * - Event publishing (Kafka)
 * - Low stock alerts
 */
@ExtendWith(MockitoExtension.class)
@ActiveProfiles("test")
public class InventoryServiceTest {

    private InventoryService inventoryService;

    @Mock
    private StockRepository stockRepository;

    @Mock
    private StockHistoryRepository stockHistoryRepository;

    @Mock
    private StockMutationRepository stockMutationRepository;

    @Mock
    private KafkaTemplate<String, EventEnvelope> kafkaTemplate;

    @BeforeEach
    public void setUp() {
        inventoryService = new InventoryService(
                stockRepository,
                stockHistoryRepository,
                stockMutationRepository,
                kafkaTemplate
        );
    }

    /**
     * Test 1: Successfully reserve stock for an order.
     */
    @Test
    public void testReserveStockSuccess() {
        Long productId = 1L;
        Integer quantity = 10;
        String orderId = "ORDER_123";

        Stock stock = new Stock();
        stock.setId(1L);
        stock.setProductId(productId);
        stock.setSku("SKU-001");
        stock.setAvailableQty(20);
        stock.setReservedQty(10);
        stock.setStatus("IN_STOCK");

        when(stockMutationRepository.reserveStock(eq(productId), eq(quantity), anyString()))
                .thenReturn(stock);

        ReserveStockResponse response = inventoryService.reserveStock(productId, quantity, orderId);

        assertEquals("SUCCESS", response.getStatus());
        assertEquals(productId, response.getProductId());
        assertEquals(10, response.getReservedQty());

        verify(stockMutationRepository).reserveStock(productId, quantity, "ORDER_" + orderId);
        verify(kafkaTemplate).send(anyString(), anyString(), any(EventEnvelope.class));
    }

    /**
     * Test 2: Fail to reserve stock due to insufficient quantity.
     */
    @Test
    public void testReserveStockInsufficientQuantity() {
        Long productId = 1L;
        Integer quantity = 100;
        String orderId = "ORDER_123";

        when(stockMutationRepository.reserveStock(eq(productId), eq(quantity), anyString()))
                .thenThrow(new ConflictException("Insufficient stock"));

        assertThrows(ConflictException.class, () ->
                inventoryService.reserveStock(productId, quantity, orderId)
        );
    }

    /**
     * Test 3: Fail to reserve stock due to invalid quantity (negative).
     */
    @Test
    public void testReserveStockInvalidQuantity() {
        Long productId = 1L;
        Integer quantity = -5;
        String orderId = "ORDER_123";

        assertThrows(ValidationException.class, () ->
                inventoryService.reserveStock(productId, quantity, orderId)
        );
    }

    /**
     * Test 4: Fail to reserve stock due to duplicate (idempotency).
     */
    @Test
    public void testReserveStockDuplicate() {
        Long productId = 1L;
        Integer quantity = 10;
        String orderId = "ORDER_123";

        when(stockMutationRepository.reserveStock(eq(productId), eq(quantity), anyString()))
                .thenThrow(new ConflictException("Duplicate reservation"));

        assertThrows(ConflictException.class, () ->
                inventoryService.reserveStock(productId, quantity, orderId)
        );
    }

    /**
     * Test 5: Successfully deduct stock after payment.
     */
    @Test
    public void testDeductStockSuccess() {
        Long productId = 1L;
        Integer quantity = 10;
        String orderId = "ORDER_123";
        String paymentId = "PAYMENT_456";

        Stock stock = new Stock();
        stock.setId(1L);
        stock.setProductId(productId);
        stock.setSku("SKU-001");
        stock.setAvailableQty(20);
        stock.setReservedQty(0);
        stock.setSoldQty(10);
        stock.setStatus("IN_STOCK");

        when(stockMutationRepository.deductStock(eq(productId), eq(quantity), anyString()))
                .thenReturn(stock);

        inventoryService.deductStock(productId, quantity, orderId, paymentId);

        verify(stockMutationRepository).deductStock(productId, quantity, "PAYMENT_" + paymentId);
        verify(kafkaTemplate).send(anyString(), anyString(), any(EventEnvelope.class));
    }

    /**
     * Test 6: Fail to deduct stock due to insufficient reserved quantity.
     */
    @Test
    public void testDeductStockInsufficientReserved() {
        Long productId = 1L;
        Integer quantity = 100;
        String orderId = "ORDER_123";
        String paymentId = "PAYMENT_456";

        when(stockMutationRepository.deductStock(eq(productId), eq(quantity), anyString()))
                .thenThrow(new ConflictException("Insufficient reserved stock"));

        assertThrows(ConflictException.class, () ->
                inventoryService.deductStock(productId, quantity, orderId, paymentId)
        );
    }

    /**
     * Test 7: Successfully release stock on order cancellation.
     */
    @Test
    public void testReleaseStockSuccess() {
        Long productId = 1L;
        Integer quantity = 10;
        String orderId = "ORDER_123";

        Stock stock = new Stock();
        stock.setId(1L);
        stock.setProductId(productId);
        stock.setSku("SKU-001");
        stock.setAvailableQty(30);
        stock.setReservedQty(0);
        stock.setStatus("IN_STOCK");

        when(stockMutationRepository.releaseStock(eq(productId), eq(quantity), anyString()))
                .thenReturn(stock);

        inventoryService.releaseStock(productId, quantity, orderId);

        verify(stockMutationRepository).releaseStock(productId, quantity, "ORDER_CANCELLED_" + orderId);
        verify(kafkaTemplate).send(anyString(), anyString(), any(EventEnvelope.class));
    }

    /**
     * Test 8: Fail to release stock due to invalid state.
     */
    @Test
    public void testReleaseStockInvalidState() {
        Long productId = 1L;
        Integer quantity = 50;
        String orderId = "ORDER_123";

        when(stockMutationRepository.releaseStock(eq(productId), eq(quantity), anyString()))
                .thenThrow(new ConflictException("Insufficient reserved quantity"));

        assertThrows(ConflictException.class, () ->
                inventoryService.releaseStock(productId, quantity, orderId)
        );
    }

    /**
     * Test 9: Get stock information for a product.
     */
    @Test
    public void testGetStockInfo() {
        Long productId = 1L;

        Stock stock = new Stock();
        stock.setId(1L);
        stock.setProductId(productId);
        stock.setSku("SKU-001");
        stock.setAvailableQty(20);
        stock.setReservedQty(10);
        stock.setSoldQty(5);
        stock.setStatus("IN_STOCK");
        stock.setCreatedAt(LocalDateTime.now());
        stock.setUpdatedAt(LocalDateTime.now());

        when(stockRepository.findByProductIdForRead(productId))
                .thenReturn(Optional.of(stock));

        StockResponse response = inventoryService.getStockInfo(productId);

        assertEquals(productId, response.getProductId());
        assertEquals(20, response.getAvailableQty());
        assertEquals(10, response.getReservedQty());
        assertEquals("SKU-001", response.getSku());
    }

    /**
     * Test 10: Fail to get stock info for non-existent product.
     */
    @Test
    public void testGetStockInfoNotFound() {
        Long productId = 999L;

        when(stockRepository.findByProductIdForRead(productId))
                .thenReturn(Optional.empty());

        assertThrows(NotFoundException.class, () ->
                inventoryService.getStockInfo(productId)
        );
    }

    /**
     * Test 11: Get stock audit trail (paginated).
     */
    @Test
    public void testGetStockHistory() {
        Long productId = 1L;

        StockHistory history = new StockHistory();
        history.setId(1L);
        history.setStockId(1L);
        history.setProductId(productId);
        history.setOperationType("RESERVE");
        history.setQtyChange(-10);
        history.setReason("ORDER_123");
        history.setCreatedAt(LocalDateTime.now());

        org.springframework.data.domain.Page<StockHistory> page =
                new PageImpl<>(List.of(history));

        when(stockHistoryRepository.findByProductId(eq(productId), any(Pageable.class)))
                .thenReturn(page);

        PageRequest pageRequest = new PageRequest(1, 10);
        StockPageResponse response = inventoryService.getStockHistory(productId, pageRequest);

        assertEquals(1, response.getData().size());
        assertEquals("RESERVE", response.getData().get(0).getOperationType());
        assertEquals("ORDER_123", response.getData().get(0).getReason());
    }

    /**
     * Test 12: Admin adjustment of stock.
     */
    @Test
    public void testAdjustStock() {
        Long productId = 1L;
        Integer availableQty = 50;
        Integer reservedQty = 10;
        String reason = "INVENTORY_CORRECTION";

        Stock stock = new Stock();
        stock.setId(1L);
        stock.setProductId(productId);
        stock.setSku("SKU-001");
        stock.setAvailableQty(availableQty);
        stock.setReservedQty(reservedQty);
        stock.setStatus("IN_STOCK");

        when(stockMutationRepository.adjustStock(eq(productId), eq(availableQty), eq(reservedQty), eq(reason), anyString()))
                .thenReturn(stock);

        inventoryService.adjustStock(productId, availableQty, reservedQty, reason);

        verify(stockMutationRepository).adjustStock(productId, availableQty, reservedQty, reason, "anonymousUser");
        verify(kafkaTemplate).send(anyString(), anyString(), any(EventEnvelope.class));
    }

    /**
     * Test 13: Fail admin adjustment with negative quantity.
     */
    @Test
    public void testAdjustStockNegativeQuantity() {
        Long productId = 1L;
        Integer availableQty = -10;
        Integer reservedQty = 10;
        String reason = "INVENTORY_CORRECTION";

        assertThrows(ValidationException.class, () ->
                inventoryService.adjustStock(productId, availableQty, reservedQty, reason)
        );
    }

    /**
     * Test 14: Get low stock alerts.
     */
    @Test
    public void testGetLowStockAlerts() {
        Stock stock = new Stock();
        stock.setId(1L);
        stock.setProductId(1L);
        stock.setSku("SKU-001");
        stock.setAvailableQty(5);
        stock.setReorderThreshold(10);
        stock.setStatus("LOW_STOCK");

        org.springframework.data.domain.Page<Stock> page =
                new PageImpl<>(List.of(stock));

        when(stockRepository.findBelowReorderThreshold(any(Pageable.class)))
                .thenReturn(page);

        PageRequest pageRequest = new PageRequest(1, 10);
        Page<StockResponse> response = inventoryService.getLowStockAlerts(pageRequest);

        assertEquals(1, response.getContent().size());
        assertEquals("SKU-001", response.getContent().get(0).getSku());
        assertEquals("LOW_STOCK", response.getContent().get(0).getStatus());
    }

    /**
     * Test 15: Verify Kafka event is published with correct event type.
     */
    @Test
    public void testEventPublishing() {
        Long productId = 1L;
        Integer quantity = 10;
        String orderId = "ORDER_123";

        Stock stock = new Stock();
        stock.setId(1L);
        stock.setProductId(productId);
        stock.setSku("SKU-001");
        stock.setAvailableQty(20);
        stock.setReservedQty(10);
        stock.setStatus("IN_STOCK");

        when(stockMutationRepository.reserveStock(eq(productId), eq(quantity), anyString()))
                .thenReturn(stock);

        inventoryService.reserveStock(productId, quantity, orderId);

        ArgumentCaptor<EventEnvelope> eventCaptor = ArgumentCaptor.forClass(EventEnvelope.class);
        verify(kafkaTemplate).send(anyString(), anyString(), eventCaptor.capture());

        EventEnvelope event = eventCaptor.getValue();
        assertEquals(EventType.INVENTORY_RESERVED, event.getEventType());
        assertEquals("inventory-service", event.getProducer());
        assertEquals(orderId, event.getCorrelationId());
    }
}
