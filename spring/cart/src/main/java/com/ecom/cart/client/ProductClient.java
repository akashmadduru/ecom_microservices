package com.ecom.cart.client;

import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;

/**
 * HTTP client for calling Products Service with Circuit Breaker protection.
 * Isolates remote call failures and prevents cascading failures.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ProductClient {

    @Value("${products.service.url:http://products-service:8083}")
    private String productsServiceUrl;

    private final RestTemplate restTemplate;

    /**
     * Get product details with circuit breaker protection.
     * Circuit breaker: products-getProduct
     * Failure threshold: 50% (half of calls fail = open circuit)
     * Slow call threshold: 2 seconds
     *
     * @param productId Product ID to fetch
     * @return Product details as String (JSON)
     * @throws ProductServiceUnavailableException if service is unavailable or circuit is open
     */
    @CircuitBreaker(name = "products-getProduct", fallbackMethod = "getProductFallback")
    public String getProduct(String productId) {
        try {
            String url = productsServiceUrl + "/api/v1/products/" + productId;
            log.debug("Calling Products Service: GET {}", url);
            String response = restTemplate.getForObject(url, String.class);
            log.debug("Successfully retrieved product {}", productId);
            return response;
        } catch (HttpClientErrorException e) {
            log.warn("HTTP error calling Products Service for product {}: {}", productId, e.getStatusCode());
            throw e;
        }
    }

    /**
     * Fallback method for getProduct when circuit breaker is open or call fails.
     * Called automatically by Resilience4j when circuit is OPEN or HALF_OPEN with failures.
     *
     * @param productId Product ID that failed
     * @param exception Exception that triggered fallback
     * @return Default product response or throws exception
     * @throws ProductServiceUnavailableException always
     */
    public String getProductFallback(String productId, Exception exception) {
        log.error("Circuit breaker fallback triggered for product {}: {}", productId, exception.getMessage());
        throw new ProductServiceUnavailableException(
            "Product Service is currently unavailable. Please try again later. (Circuit Breaker: " +
            exception.getClass().getSimpleName() + ")"
        );
    }

    /**
     * Custom exception for Product Service unavailability.
     */
    public static class ProductServiceUnavailableException extends RuntimeException {
        public ProductServiceUnavailableException(String message) {
            super(message);
        }

        public ProductServiceUnavailableException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
