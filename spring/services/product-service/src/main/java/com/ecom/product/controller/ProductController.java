package com.ecom.product.controller;

import com.ecom.common.pagination.PageRequest;
import com.ecom.product.dto.ProductCreateRequest;
import com.ecom.product.dto.ProductPageResponse;
import com.ecom.product.dto.ProductResponse;
import com.ecom.product.dto.ProductUpdateRequest;
import com.ecom.product.service.ProductService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * ProductController: REST endpoints for product catalog operations.
 *
 * Implements public browse and admin/seller management endpoints
 * matching FastAPI contracts.
 */
@RestController
@RequestMapping("/api/v1/products")
@RequiredArgsConstructor
@Slf4j
public class ProductController {
    private final ProductService productService;

    /**
     * GET /products - List published products with pagination.
     */
    @GetMapping
    public ResponseEntity<ProductPageResponse> listProducts(
            @RequestParam(defaultValue = "1") Integer page,
            @RequestParam(defaultValue = "20") Integer limit) {
        log.info("Listing products: page={}, limit={}", page, limit);
        PageRequest pageRequest = new PageRequest(page, limit);
        ProductPageResponse response = ProductPageResponse.from(
                productService.listPublishedProducts(pageRequest)
        );
        return ResponseEntity.ok(response);
    }

    /**
     * GET /products/search - Full-text search products.
     */
    @GetMapping("/search")
    public ResponseEntity<ProductPageResponse> searchProducts(
            @RequestParam String q,
            @RequestParam(defaultValue = "1") Integer page,
            @RequestParam(defaultValue = "20") Integer limit) {
        log.info("Searching products: query={}, page={}, limit={}", q, page, limit);
        PageRequest pageRequest = new PageRequest(page, limit);
        ProductPageResponse response = ProductPageResponse.from(
                productService.searchProducts(q, pageRequest)
        );
        return ResponseEntity.ok(response);
    }

    /**
     * GET /products/{id} - Get published product details.
     */
    @GetMapping("/{id}")
    public ResponseEntity<ProductResponse> getProduct(@PathVariable Integer id) {
        log.info("Getting product: id={}", id);
        ProductResponse response = productService.getProductPublic(id);
        return ResponseEntity.ok(response);
    }

    /**
     * POST /products - Create a new product (seller/admin only).
     */
    @PostMapping
    @PreAuthorize("hasAnyRole('SELLER', 'ADMIN')")
    public ResponseEntity<ProductResponse> createProduct(
            @Valid @RequestBody ProductCreateRequest request,
            Authentication authentication) {
        String sellerId = authentication.getName();
        log.info("Creating product: title={}, seller={}", request.getTitle(), sellerId);
        ProductResponse response = productService.createProduct(request, sellerId);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * PUT /products/{id} - Update an existing product (owner/admin only).
     */
    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('SELLER', 'ADMIN')")
    public ResponseEntity<ProductResponse> updateProduct(
            @PathVariable Integer id,
            @Valid @RequestBody ProductUpdateRequest request,
            Authentication authentication) {
        String userId = authentication.getName();
        String userRole = authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .findFirst()
                .orElse("CUSTOMER");
        log.info("Updating product: id={}, user={}, role={}", id, userId, userRole);
        ProductResponse response = productService.updateProduct(id, request, userId, userRole);
        return ResponseEntity.ok(response);
    }

    /**
     * DELETE /products/{id} - Soft-delete a product (owner/admin only).
     */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('SELLER', 'ADMIN')")
    public ResponseEntity<Void> deleteProduct(
            @PathVariable Integer id,
            Authentication authentication) {
        String userId = authentication.getName();
        String userRole = authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .findFirst()
                .orElse("CUSTOMER");
        log.info("Deleting product: id={}, user={}", id, userId);
        productService.deleteProduct(id, userId, userRole);
        return ResponseEntity.noContent().build();
    }

    /**
     * POST /products/{id}/restore - Restore a soft-deleted product (admin only).
     */
    @PostMapping("/{id}/restore")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ProductResponse> restoreProduct(@PathVariable Integer id) {
        log.info("Restoring product: id={}", id);
        ProductResponse response = productService.restoreProduct(id);
        return ResponseEntity.ok(response);
    }
}
