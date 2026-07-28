package com.ecom.product.dto;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * ProductCreateRequestTest: Unit tests for DTO validation.
 *
 * Tests:
 * - Required fields validation (@NotBlank)
 * - Size constraints (@Size)
 * - Decimal constraints (@DecimalMin)
 * - Valid request acceptance
 */
@SpringBootTest
@ActiveProfiles("test")
@DisplayName("ProductCreateRequest Validation Tests")
class ProductsCreateRequestTest {
    @Autowired
    private Validator validator;

    private ProductCreateRequest request;

    @BeforeEach
    void setUp() {
        request = ProductCreateRequest.builder()
                .title("Valid Product Title")
                .retailPrice(new BigDecimal("99.99"))
                .discount(BigDecimal.ZERO)
                .description("A valid product description")
                .build();
    }

    @Test
    @DisplayName("Should accept valid product create request")
    void testValidRequest() {
        Set<ConstraintViolation<ProductCreateRequest>> violations = validator.validate(request);
        assertThat(violations).isEmpty();
    }

    @Test
    @DisplayName("Should reject empty title")
    void testEmptyTitle() {
        request.setTitle("");
        Set<ConstraintViolation<ProductCreateRequest>> violations = validator.validate(request);

        assertThat(violations).isNotEmpty();
        assertThat(violations.stream()
                .anyMatch(v -> v.getPropertyPath().toString().equals("title")))
                .isTrue();
    }

    @Test
    @DisplayName("Should reject null title")
    void testNullTitle() {
        request.setTitle(null);
        Set<ConstraintViolation<ProductCreateRequest>> violations = validator.validate(request);

        assertThat(violations).isNotEmpty();
    }

    @Test
    @DisplayName("Should reject title exceeding max length")
    void testTitleTooLong() {
        request.setTitle("a".repeat(501));
        Set<ConstraintViolation<ProductCreateRequest>> violations = validator.validate(request);

        assertThat(violations).isNotEmpty();
    }

    @Test
    @DisplayName("Should reject negative retail price")
    void testNegativeRetailPrice() {
        request.setRetailPrice(new BigDecimal("-10.00"));
        Set<ConstraintViolation<ProductCreateRequest>> violations = validator.validate(request);

        assertThat(violations).isNotEmpty();
    }

    @Test
    @DisplayName("Should reject negative discount")
    void testNegativeDiscount() {
        request.setDiscount(new BigDecimal("-5.00"));
        Set<ConstraintViolation<ProductCreateRequest>> violations = validator.validate(request);

        assertThat(violations).isNotEmpty();
    }

    @Test
    @DisplayName("Should accept zero prices")
    void testZeroPrices() {
        request.setRetailPrice(BigDecimal.ZERO);
        request.setDiscount(BigDecimal.ZERO);
        Set<ConstraintViolation<ProductCreateRequest>> violations = validator.validate(request);

        assertThat(violations).isEmpty();
    }
}
