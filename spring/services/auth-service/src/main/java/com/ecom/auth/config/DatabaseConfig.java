package com.ecom.auth.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties(prefix = "spring.datasource")
public class DatabaseConfig {
    // Configuration is handled by Spring Boot's auto-configuration
    // No additional configuration needed
}
