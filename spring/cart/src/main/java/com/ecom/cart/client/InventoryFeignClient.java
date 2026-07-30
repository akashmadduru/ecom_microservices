package com.ecom.cart.client;

import com.ecom.cart.dto.ReservationResponse;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

/**
 * Feign client for Inventory Service.
 * Uses Eureka service discovery (service name "inventory-service").
 * Integrates with Resilience4j circuit breaker via FeignClientConfiguration.
 */
@FeignClient(name = "inventory-service", configuration = com.ecom.cart.config.FeignClientConfiguration.class)
public interface InventoryFeignClient {

    /**
     * Get user's reserved items from inventory.
     * Circuit breaker: inventory-getReservedItems
     *
     * @param userId User ID to fetch reservations for
     * @return Array of reservation responses
     */
    @GetMapping("/api/v1/inventory/reserved/{userId}")
    ReservationResponse[] getReservedItems(@PathVariable("userId") String userId);
}
