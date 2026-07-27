package com.ecom.inventory.controller;

import com.ecom.common.pagination.Page;
import com.ecom.common.pagination.PageRequest;
import com.ecom.inventory.dto.ReserveStockRequest;
import com.ecom.inventory.dto.ReserveStockResponse;
import com.ecom.inventory.dto.StockPageResponse;
import com.ecom.inventory.dto.StockResponse;
import com.ecom.inventory.service.InventoryService;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * InventoryController: REST API for stock operations.
 *
 * Endpoints:
 * - GET /inventory/{product_id}: Public stock info
 * - GET /inventory/{product_id}/history: Audit trail (paginated)
 * - POST /inventory/{product_id}/reserve: Reserve for order (internal)
 * - POST /inventory/{product_id}/deduct: Deduct after payment (internal)
 * - POST /inventory/{product_id}/release: Release on cancellation (internal)
 * - POST /inventory/{product_id}/adjust: Admin correction
 * - GET /inventory/alerts/low-stock: Admin reorder alerts
 */
@RestController
@RequestMapping("/inventory")
public class InventoryController {
    private static final Logger log = LoggerFactory.getLogger(InventoryController.class);
    private final InventoryService inventoryService;

    public InventoryController(InventoryService inventoryService) {
        this.inventoryService = inventoryService;
    }

    /**
     * GET /inventory/{product_id}: Get current stock information (public).
     * No authentication required for availability checks.
     */
    @GetMapping("/{productId}")
    public ResponseEntity<StockResponse> getStockInfo(@PathVariable Long productId) {
        log.info("GET /inventory/{} - fetching stock info", productId);
        StockResponse response = inventoryService.getStockInfo(productId);
        return ResponseEntity.ok(response);
    }

    /**
     * GET /inventory/{product_id}/history: Get stock audit trail (paginated).
     * Only admins can view detailed history.
     */
    @GetMapping("/{productId}/history")
    @PreAuthorize("hasAnyRole('ADMIN')")
    public ResponseEntity<StockPageResponse> getStockHistory(
            @PathVariable Long productId,
            @RequestParam(defaultValue = "1") Integer page,
            @RequestParam(defaultValue = "50") Integer limit) {
        log.info("GET /inventory/{}/history - fetching audit trail, page={}", productId, page);

        PageRequest pageRequest = new PageRequest(page, limit);
        StockPageResponse response = inventoryService.getStockHistory(productId, pageRequest);
        return ResponseEntity.ok(response);
    }

    /**
     * POST /inventory/{product_id}/reserve: Reserve stock for an order.
     * Internal endpoint (admin/service-to-service only).
     * Called on ORDER_CREATED event.
     */
    @PostMapping("/{productId}/reserve")
    @PreAuthorize("hasAnyRole('ADMIN', 'SYSTEM')")
    public ResponseEntity<ReserveStockResponse> reserveStock(
            @PathVariable Long productId,
            @Valid @RequestBody ReserveStockRequest request) {
        log.info("POST /inventory/{}/reserve - quantity: {}, order_id: {}", productId, request.getQuantity(), request.getOrderId());

        // Validate that path productId matches request productId
        if (!productId.equals(request.getProductId())) {
            return ResponseEntity.badRequest().build();
        }

        ReserveStockResponse response = inventoryService.reserveStock(productId, request.getQuantity(), request.getOrderId());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * POST /inventory/{product_id}/deduct: Deduct stock after payment confirmation.
     * Internal endpoint (admin/service-to-service only).
     * Called on PAYMENT_COMPLETED event.
     */
    @PostMapping("/{productId}/deduct")
    @PreAuthorize("hasAnyRole('ADMIN', 'SYSTEM')")
    public ResponseEntity<Void> deductStock(
            @PathVariable Long productId,
            @Valid @RequestBody ReserveStockRequest request) {
        log.info("POST /inventory/{}/deduct - quantity: {}, order_id: {}", productId, request.getQuantity(), request.getOrderId());

        // Validate that path productId matches request productId
        if (!productId.equals(request.getProductId())) {
            return ResponseEntity.badRequest().build();
        }

        inventoryService.deductStock(productId, request.getQuantity(), request.getOrderId(), request.getOrderId());
        return ResponseEntity.noContent().build();
    }

    /**
     * POST /inventory/{product_id}/release: Release reserved stock on order cancellation.
     * Internal endpoint (admin/service-to-service only).
     * Called on ORDER_CANCELLED event.
     */
    @PostMapping("/{productId}/release")
    @PreAuthorize("hasAnyRole('ADMIN', 'SYSTEM')")
    public ResponseEntity<Void> releaseStock(
            @PathVariable Long productId,
            @Valid @RequestBody ReserveStockRequest request) {
        log.info("POST /inventory/{}/release - quantity: {}, order_id: {}", productId, request.getQuantity(), request.getOrderId());

        // Validate that path productId matches request productId
        if (!productId.equals(request.getProductId())) {
            return ResponseEntity.badRequest().build();
        }

        inventoryService.releaseStock(productId, request.getQuantity(), request.getOrderId());
        return ResponseEntity.noContent().build();
    }

    /**
     * POST /inventory/{product_id}/adjust: Admin manual stock correction.
     * For inventory count corrections, damage, write-offs, etc.
     */
    @PostMapping("/{productId}/adjust")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<StockResponse> adjustStock(
            @PathVariable Long productId,
            @RequestParam(value = "available_qty") Integer availableQty,
            @RequestParam(value = "reserved_qty") Integer reservedQty,
            @RequestParam(value = "reason") String reason) {
        log.info("POST /inventory/{}/adjust - available: {}, reserved: {}, reason: {}", productId, availableQty, reservedQty, reason);

        inventoryService.adjustStock(productId, availableQty, reservedQty, reason);
        StockResponse response = inventoryService.getStockInfo(productId);
        return ResponseEntity.ok(response);
    }

    /**
     * GET /inventory/alerts/low-stock: Get low stock alerts (below reorder threshold).
     * Admin-only endpoint for inventory management.
     */
    @GetMapping("/alerts/low-stock")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Page<StockResponse>> getLowStockAlerts(
            @RequestParam(defaultValue = "1") Integer page,
            @RequestParam(defaultValue = "50") Integer limit) {
        log.info("GET /inventory/alerts/low-stock - page={}", page);

        PageRequest pageRequest = new PageRequest(page, limit);
        Page<StockResponse> response = inventoryService.getLowStockAlerts(pageRequest);
        return ResponseEntity.ok(response);
    }
}
