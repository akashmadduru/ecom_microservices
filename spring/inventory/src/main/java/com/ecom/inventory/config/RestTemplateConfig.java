package com.ecom.inventory.config;

import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

/**
 * Configuration for RestTemplate used in inter-service HTTP calls.
 */
@Configuration
public class RestTemplateConfig {

    /**
     * Create RestTemplate bean with sensible defaults:
     * - 5 second connection timeout
     * - 10 second read timeout
     * - Basic error handling
     */
    @Bean
    public RestTemplate restTemplate(RestTemplateBuilder builder) {
        return builder
            .setConnectTimeout(java.time.Duration.ofSeconds(5))
            .setReadTimeout(java.time.Duration.ofSeconds(10))
            .build();
    }
}
