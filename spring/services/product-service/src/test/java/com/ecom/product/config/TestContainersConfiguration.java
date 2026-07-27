package com.ecom.product.config;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * TestContainersConfiguration: Test configuration with PostgreSQL container.
 *
 * Usage:
 * - @SpringBootTest with @ActiveProfiles("test")
 * - Automatically starts PostgreSQL 15 container
 * - Configures database connection via environment variables
 *
 * Note: Requires testcontainers dependency in pom.xml
 */
@TestConfiguration
public class TestContainersConfiguration {

    @Bean
    public PostgreSQLContainer<?> postgresqlContainer() {
        PostgreSQLContainer<?> container = new PostgreSQLContainer<>("postgres:15-alpine")
                .withDatabaseName("ecom_product_test")
                .withUsername("test_user")
                .withPassword("test_password")
                .withExposedPorts(5432);

        container.start();
        return container;
    }
}
