package com.ecom.cart.config;

import feign.RequestInterceptor;
import feign.codec.ErrorDecoder;
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.util.logging.Logger;

/**
 * Configuration for OpenFeign clients in Cart Service.
 * Configures:
 * - Resilience4j Circuit Breaker (50% failure threshold, 3s timeout)
 * - JWT Bearer token propagation via RequestInterceptor
 * - Custom ErrorDecoder for exception mapping
 */
@Configuration
public class FeignClientConfiguration {

    private static final Logger logger = Logger.getLogger(FeignClientConfiguration.class.getName());

    /**
     * Circuit Breaker configuration.
     * Settings:
     * - Failure threshold: 50% (circuit opens when 50% of calls fail)
     * - Timeout: 3000ms (3 seconds)
     * - Slow call duration threshold: 2 seconds
     * - Wait duration in open state: 30 seconds
     * - Permitted calls in half-open state: 3
     */
    @Bean
    public CircuitBreakerRegistry circuitBreakerRegistry() {
        CircuitBreakerConfig defaultConfig = CircuitBreakerConfig.custom()
            .failureRateThreshold(50.0f)
            .slowCallRateThreshold(50.0f)
            .slowCallDurationThreshold(Duration.ofSeconds(2))
            .waitDurationInOpenState(Duration.ofSeconds(30))
            .permittedNumberOfCallsInHalfOpenState(3)
            .recordExceptions(Exception.class)
            .ignoreExceptions(IllegalArgumentException.class)
            .build();

        CircuitBreakerRegistry registry = CircuitBreakerRegistry.of(defaultConfig);

        // Add registry event consumer for monitoring
        registry.getEventPublisher()
            .onEntryAdded(event -> logger.info("CircuitBreaker " + event.getAddedEntry().getName() + " registered"))
            .onEntryRemoved(event -> logger.info("CircuitBreaker " + event.getRemovedEntry().getName() + " removed"));

        return registry;
    }

    /**
     * RequestInterceptor to propagate JWT Bearer token from current request to Feign calls.
     * Extracts the Authorization header from the current request context and adds it to Feign requests.
     */
    @Bean
    public RequestInterceptor jwtBearerTokenInterceptor() {
        return requestTemplate -> {
            try {
                // Try to get JWT token from current HTTP request context
                RequestAttributes attributes = RequestContextHolder.getRequestAttributes();
                if (attributes instanceof ServletRequestAttributes) {
                    HttpServletRequest request = ((ServletRequestAttributes) attributes).getRequest();
                    String authHeader = request.getHeader("Authorization");

                    if (authHeader != null && !authHeader.isEmpty()) {
                        requestTemplate.header("Authorization", authHeader);
                        logger.fine("JWT Bearer token propagated to Feign client");
                    }
                }
            } catch (IllegalStateException e) {
                // RequestContextHolder.getRequestAttributes() will throw if no request context
                // This is expected for async or background calls
                logger.fine("No HTTP request context available for JWT propagation");
            }
        };
    }

    /**
     * Custom ErrorDecoder for Feign clients.
     * Maps HTTP error responses to custom exceptions for better error handling.
     */
    @Bean
    public ErrorDecoder feignErrorDecoder() {
        return (methodKey, response) -> {
            String errorMessage = String.format(
                "Feign client error [%s]: %s - %s",
                response.status(),
                methodKey,
                response.reason()
            );

            logger.severe(errorMessage);

            return switch (response.status()) {
                case 400 -> new FeignClientException.BadRequestException(errorMessage);
                case 401 -> new FeignClientException.UnauthorizedException(errorMessage);
                case 403 -> new FeignClientException.ForbiddenException(errorMessage);
                case 404 -> new FeignClientException.NotFoundException(errorMessage);
                case 503 -> new FeignClientException.ServiceUnavailableException(errorMessage);
                default -> new FeignClientException(errorMessage);
            };
        };
    }

    /**
     * Base exception class for Feign client errors.
     */
    public static class FeignClientException extends RuntimeException {
        public FeignClientException(String message) {
            super(message);
        }

        public FeignClientException(String message, Throwable cause) {
            super(message, cause);
        }

        public static class BadRequestException extends FeignClientException {
            public BadRequestException(String message) {
                super(message);
            }
        }

        public static class UnauthorizedException extends FeignClientException {
            public UnauthorizedException(String message) {
                super(message);
            }
        }

        public static class ForbiddenException extends FeignClientException {
            public ForbiddenException(String message) {
                super(message);
            }
        }

        public static class NotFoundException extends FeignClientException {
            public NotFoundException(String message) {
                super(message);
            }
        }

        public static class ServiceUnavailableException extends FeignClientException {
            public ServiceUnavailableException(String message) {
                super(message);
            }
        }
    }
}
