package com.ecom.inventory.controller;

import com.ecom.common.pagination.Page;
import com.ecom.common.pagination.PageRequest;
import com.ecom.inventory.dto.ReserveStockResponse;
import com.ecom.inventory.dto.StockResponse;
import com.ecom.inventory.service.InventoryService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * InventoryControllerTest: API endpoint tests.
 *
 * Tests:
 * - GET /inventory/{product_id}: Public stock info
 * - GET /inventory/{product_id}/history: Audit trail (admin-only)
 * - POST /inventory/{product_id}/reserve: Stock reservation (system-only)
 * - POST /inventory/{product_id}/deduct: Stock deduction (system-only)
 * - POST /inventory/{product_id}/release: Stock release (system-only)
 * - POST /inventory/{product_id}/adjust: Stock adjustment (admin-only)
 * - GET /inventory/alerts/low-stock: Low stock alerts (admin-only)
 * - RBAC enforcement
 * - HTTP status codes (200, 201, 204, 400, 404, 403)
 */
@WebMvcTest(InventoryController.class)
@ActiveProfiles("test")
public class InventoryControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private InventoryService inventoryService;

    /**
     * Test 1: GET /inventory/{product_id} - Get stock info (public, no auth required).
     */
    @Test
    public void testGetStockInfoPublic() throws Exception {
        Long productId = 1L;

        StockResponse response = StockResponse.builder()
                .id(1L)
                .productId(productId)
                .sku("SKU-001")
                .availableQty(20)
                .reservedQty(10)
                .totalQty(30)
                .status("IN_STOCK")
                .updatedAt(LocalDateTime.now())
                .build();

        when(inventoryService.getStockInfo(productId))
                .thenReturn(response);

        mockMvc.perform(get("/inventory/{productId}", productId)
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.product_id").value(productId))
                .andExpect(jsonPath("$.sku").value("SKU-001"))
                .andExpect(jsonPath("$.available_qty").value(20))
                .andExpect(jsonPath("$.reserved_qty").value(10));
    }

    /**
     * Test 2: GET /inventory/{product_id}/history - Get audit trail (admin-only).
     */
    @Test
    @WithMockUser(roles = "ADMIN")
    public void testGetStockHistoryAdmin() throws Exception {
        Long productId = 1L;

        com.ecom.inventory.dto.StockPageResponse pageResponse = new com.ecom.inventory.dto.StockPageResponse();
        pageResponse.setPage(1);
        pageResponse.setLimit(10);
        pageResponse.setTotalItems(1L);
        pageResponse.setTotalPages(1);
        pageResponse.setHasMore(false);
        pageResponse.setData(List.of());

        when(inventoryService.getStockHistory(anyLong(), any(PageRequest.class)))
                .thenReturn(pageResponse);

        mockMvc.perform(get("/inventory/{productId}/history?page=1&limit=10", productId)
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.limit").value(10));
    }

    /**
     * Test 3: GET /inventory/{product_id}/history - Deny non-admin access.
     */
    @Test
    @WithMockUser(roles = "CUSTOMER")
    public void testGetStockHistoryDenied() throws Exception {
        Long productId = 1L;

        mockMvc.perform(get("/inventory/{productId}/history?page=1&limit=10", productId)
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isForbidden());
    }

    /**
     * Test 4: POST /inventory/{product_id}/reserve - Reserve stock (system-only).
     */
    @Test
    @WithMockUser(roles = "SYSTEM")
    public void testReserveStock() throws Exception {
        Long productId = 1L;

        String request = objectMapper.writeValueAsString(
                java.util.Map.of(
                        "product_id", productId,
                        "quantity", 10,
                        "order_id", "ORDER_123"
                )
        );

        ReserveStockResponse response = ReserveStockResponse.builder()
                .status("SUCCESS")
                .message("Stock reserved successfully")
                .productId(productId)
                .reservedQty(10)
                .availableQty(20)
                .build();

        when(inventoryService.reserveStock(anyLong(), anyInt(), anyString()))
                .thenReturn(response);

        mockMvc.perform(post("/inventory/{productId}/reserve", productId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(request))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("SUCCESS"))
                .andExpect(jsonPath("$.reserved_qty").value(10));
    }

    /**
     * Test 5: POST /inventory/{product_id}/reserve - Deny customer access.
     */
    @Test
    @WithMockUser(roles = "CUSTOMER")
    public void testReserveStockDenied() throws Exception {
        Long productId = 1L;

        String request = objectMapper.writeValueAsString(
                java.util.Map.of(
                        "product_id", productId,
                        "quantity", 10,
                        "order_id", "ORDER_123"
                )
        );

        mockMvc.perform(post("/inventory/{productId}/reserve", productId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(request))
                .andExpect(status().isForbidden());
    }

    /**
     * Test 6: POST /inventory/{product_id}/deduct - Deduct stock (system-only).
     */
    @Test
    @WithMockUser(roles = "SYSTEM")
    public void testDeductStock() throws Exception {
        Long productId = 1L;

        String request = objectMapper.writeValueAsString(
                java.util.Map.of(
                        "product_id", productId,
                        "quantity", 10,
                        "order_id", "ORDER_123"
                )
        );

        mockMvc.perform(post("/inventory/{productId}/deduct", productId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(request))
                .andExpect(status().isNoContent());

        verify(inventoryService).deductStock(anyLong(), anyInt(), anyString(), anyString());
    }

    /**
     * Test 7: POST /inventory/{product_id}/release - Release stock (system-only).
     */
    @Test
    @WithMockUser(roles = "SYSTEM")
    public void testReleaseStock() throws Exception {
        Long productId = 1L;

        String request = objectMapper.writeValueAsString(
                java.util.Map.of(
                        "product_id", productId,
                        "quantity", 10,
                        "order_id", "ORDER_123"
                )
        );

        mockMvc.perform(post("/inventory/{productId}/release", productId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(request))
                .andExpect(status().isNoContent());

        verify(inventoryService).releaseStock(anyLong(), anyInt(), anyString());
    }

    /**
     * Test 8: POST /inventory/{product_id}/adjust - Admin stock adjustment.
     */
    @Test
    @WithMockUser(roles = "ADMIN")
    public void testAdjustStock() throws Exception {
        Long productId = 1L;

        StockResponse response = StockResponse.builder()
                .id(1L)
                .productId(productId)
                .sku("SKU-001")
                .availableQty(50)
                .reservedQty(10)
                .totalQty(60)
                .status("IN_STOCK")
                .build();

        when(inventoryService.getStockInfo(productId))
                .thenReturn(response);

        mockMvc.perform(post("/inventory/{productId}/adjust?available_qty=50&reserved_qty=10&reason=CORRECTION", productId)
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.available_qty").value(50))
                .andExpect(jsonPath("$.reserved_qty").value(10));

        verify(inventoryService).adjustStock(anyLong(), anyInt(), anyInt(), anyString());
    }

    /**
     * Test 9: POST /inventory/{product_id}/adjust - Deny customer access.
     */
    @Test
    @WithMockUser(roles = "CUSTOMER")
    public void testAdjustStockDenied() throws Exception {
        Long productId = 1L;

        mockMvc.perform(post("/inventory/{productId}/adjust?available_qty=50&reserved_qty=10&reason=CORRECTION", productId)
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isForbidden());
    }

    /**
     * Test 10: GET /inventory/alerts/low-stock - Get low stock alerts (admin-only).
     */
    @Test
    @WithMockUser(roles = "ADMIN")
    public void testGetLowStockAlerts() throws Exception {
        StockResponse stock = StockResponse.builder()
                .id(1L)
                .productId(1L)
                .sku("SKU-001")
                .availableQty(5)
                .reorderThreshold(10)
                .status("LOW_STOCK")
                .build();

        Page<StockResponse> page = Page.of(
                List.of(stock),
                1, 10, 1L, 1
        );

        when(inventoryService.getLowStockAlerts(any(PageRequest.class)))
                .thenReturn(page);

        mockMvc.perform(get("/inventory/alerts/low-stock?page=1&limit=10")
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].sku").value("SKU-001"))
                .andExpect(jsonPath("$.content[0].status").value("LOW_STOCK"));
    }

    /**
     * Test 11: GET /inventory/alerts/low-stock - Deny customer access.
     */
    @Test
    @WithMockUser(roles = "CUSTOMER")
    public void testGetLowStockAlertsDenied() throws Exception {
        mockMvc.perform(get("/inventory/alerts/low-stock?page=1&limit=10")
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isForbidden());
    }

    /**
     * Test 12: POST /inventory/{product_id}/reserve with mismatched product_id.
     */
    @Test
    @WithMockUser(roles = "SYSTEM")
    public void testReserveStockMismatchedId() throws Exception {
        Long pathProductId = 1L;
        Long requestProductId = 2L;

        String request = objectMapper.writeValueAsString(
                java.util.Map.of(
                        "product_id", requestProductId,
                        "quantity", 10,
                        "order_id", "ORDER_123"
                )
        );

        mockMvc.perform(post("/inventory/{productId}/reserve", pathProductId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(request))
                .andExpect(status().isBadRequest());
    }

    /**
     * Test 13: POST /inventory/{product_id}/reserve with invalid request (missing fields).
     */
    @Test
    @WithMockUser(roles = "SYSTEM")
    public void testReserveStockInvalidRequest() throws Exception {
        Long productId = 1L;

        String request = objectMapper.writeValueAsString(
                java.util.Map.of(
                        "product_id", productId
                        // Missing quantity and order_id
                )
        );

        mockMvc.perform(post("/inventory/{productId}/reserve", productId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(request))
                .andExpect(status().isBadRequest());
    }
}
