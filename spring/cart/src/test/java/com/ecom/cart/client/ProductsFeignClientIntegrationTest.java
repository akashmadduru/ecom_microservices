package com.ecom.cart.client;

import com.ecom.cart.config.FeignClientConfiguration;
import com.ecom.cart.dto.ProductResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.cloud.contract.wiremock.AutoConfigureWireMock;
import org.springframework.test.context.TestPropertySource;

import static com.github.tomakehurst.wiremock.client.WireMock.*;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Integration tests for ProductsFeignClient.
 * Tests Feign client communication with Products Service via Eureka discovery.
 * Uses WireMock for HTTP mocking.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureWireMock(port = 0)
@TestPropertySource(properties = {
    "spring.cloud.discovery.client.simple.instances.products-service[0].uri=http://localhost:${wiremock.server.port}",
    "feign.hystrix.enabled=false"
})
class ProductsFeignClientIntegrationTest {

    @Autowired
    private ProductsFeignClient productsFeignClient;

    @BeforeEach
    void setUp() {
        reset();
    }

    /**
     * Test: Happy path - successfully retrieve product from Products Service
     * Expected: ProductResponse with correct data
     */
    @Test
    void testGetProduct_Success() {
        // Arrange
        Long productId = 1L;
        String productName = "Test Product";

        stubFor(get(urlEqualTo("/api/v1/products/1"))
            .willReturn(aResponse()
                .withStatus(200)
                .withHeader("Content-Type", "application/json")
                .withBody("{" +
                    "\"id\": 1," +
                    "\"name\": \"" + productName + "\"," +
                    "\"description\": \"Test Description\"," +
                    "\"price\": 99.99," +
                    "\"sku\": \"SKU-001\"," +
                    "\"active\": true" +
                    "}")));

        // Act
        ProductResponse response = productsFeignClient.getProduct(productId);

        // Assert
        assertNotNull(response);
        assertEquals(1L, response.getId());
        assertEquals(productName, response.getName());
        assertEquals("Test Description", response.getDescription());
        assertTrue(response.getActive());
        verify(1, getRequestedFor(urlEqualTo("/api/v1/products/1")));
    }

    /**
     * Test: Edge case - product not found (404)
     * Expected: FeignClientException.NotFoundException thrown
     */
    @Test
    void testGetProduct_NotFound() {
        // Arrange
        Long productId = 999L;

        stubFor(get(urlEqualTo("/api/v1/products/999"))
            .willReturn(aResponse()
                .withStatus(404)
                .withHeader("Content-Type", "application/json")
                .withBody("{\"error\": \"Product not found\"}")));

        // Act & Assert
        assertThrows(FeignClientConfiguration.FeignClientException.NotFoundException.class, () -> {
            productsFeignClient.getProduct(productId);
        });

        verify(1, getRequestedFor(urlEqualTo("/api/v1/products/999")));
    }

    /**
     * Test: Edge case - service unavailable (503)
     * Expected: FeignClientException.ServiceUnavailableException thrown
     */
    @Test
    void testGetProduct_ServiceUnavailable() {
        // Arrange
        Long productId = 1L;

        stubFor(get(urlEqualTo("/api/v1/products/1"))
            .willReturn(aResponse()
                .withStatus(503)
                .withHeader("Content-Type", "application/json")
                .withBody("{\"error\": \"Service Unavailable\"}")));

        // Act & Assert
        assertThrows(FeignClientConfiguration.FeignClientException.ServiceUnavailableException.class, () -> {
            productsFeignClient.getProduct(productId);
        });

        verify(1, getRequestedFor(urlEqualTo("/api/v1/products/1")));
    }
}
