package com.ecom.inventory.client;

import com.ecom.inventory.dto.ProductResponse;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

/**
 * Feign client for Products Service.
 * Uses Eureka service discovery (service name "products-service").
 * Integrates with Resilience4j circuit breaker via FeignClientConfiguration.
 */
@FeignClient(name = "products-service", configuration = com.ecom.inventory.config.FeignClientConfiguration.class)
public interface ProductsFeignClient {

    /**
     * Get product details by ID.
     * Circuit breaker: products-getProduct
     *
     * @param productId Product ID to fetch
     * @return Product details
     */
    @GetMapping("/api/v1/products/{id}")
    ProductResponse getProduct(@PathVariable("id") Long productId);
}
