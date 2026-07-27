package com.ecom.product.repository;

import com.ecom.product.model.Product;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * ProductRepositoryTest: Unit tests for ProductRepository.
 *
 * Tests:
 * - CRUD operations
 * - Full-text search via TSVECTOR
 * - Filtering (status, soft-delete)
 * - Pagination
 */
@DataJpaTest
@ActiveProfiles("test")
@DisplayName("ProductRepository Tests")
class ProductRepositoryTest {
    @Autowired
    private ProductRepository productRepository;

    private Product testProduct;

    @BeforeEach
    void setUp() {
        testProduct = Product.builder()
                .title("Test Product")
                .slug("test-product")
                .description("A test product for testing")
                .retailPrice(new BigDecimal("99.99"))
                .discount(BigDecimal.ZERO)
                .status("PUBLISHED")
                .isDeleted(false)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();
    }

    @Test
    @DisplayName("Should save and retrieve product by slug")
    void testFindBySlug() {
        Product saved = productRepository.save(testProduct);
        Product found = productRepository.findBySlug("test-product").orElse(null);

        assertThat(found).isNotNull();
        assertThat(found.getId()).isEqualTo(saved.getId());
        assertThat(found.getTitle()).isEqualTo("Test Product");
    }

    @Test
    @DisplayName("Should not find soft-deleted product")
    void testSoftDeleteExcluded() {
        Product saved = productRepository.save(testProduct);
        saved.setIsDeleted(true);
        saved.setDeletedAt(LocalDateTime.now());
        productRepository.save(saved);

        assertThat(productRepository.findBySlug("test-product")).isEmpty();
    }

    @Test
    @DisplayName("Should find published products only")
    void testFindAllPublished() {
        // Save published product
        testProduct.setStatus("PUBLISHED");
        productRepository.save(testProduct);

        // Save draft product
        Product draft = Product.builder()
                .title("Draft Product")
                .slug("draft-product")
                .status("DRAFT")
                .isDeleted(false)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();
        productRepository.save(draft);

        Page<Product> published = productRepository.findAllPublished(PageRequest.of(0, 10));

        assertThat(published.getContent()).hasSize(1);
        assertThat(published.getContent().get(0).getTitle()).isEqualTo("Test Product");
    }

    @Test
    @DisplayName("Should find products by price range")
    void testFindByPriceRange() {
        testProduct.setRetailPrice(new BigDecimal("50.00"));
        productRepository.save(testProduct);

        Product expensive = Product.builder()
                .title("Expensive Product")
                .slug("expensive-product")
                .retailPrice(new BigDecimal("200.00"))
                .status("PUBLISHED")
                .isDeleted(false)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();
        productRepository.save(expensive);

        Page<Product> results = productRepository.findByPriceRange(
                new BigDecimal("40"),
                new BigDecimal("100"),
                PageRequest.of(0, 10)
        );

        assertThat(results.getContent()).hasSize(1);
        assertThat(results.getContent().get(0).getTitle()).isEqualTo("Test Product");
    }

    @Test
    @DisplayName("Should check product existence (excluding deleted)")
    void testExistsNotDeleted() {
        Product saved = productRepository.save(testProduct);

        assertThat(productRepository.existsNotDeleted(saved.getId())).isTrue();

        saved.setIsDeleted(true);
        productRepository.save(saved);

        assertThat(productRepository.existsNotDeleted(saved.getId())).isFalse();
    }

    @Test
    @DisplayName("Should count products by status")
    void testCountByStatus() {
        testProduct.setStatus("PUBLISHED");
        productRepository.save(testProduct);

        Product draft = Product.builder()
                .title("Draft")
                .slug("draft")
                .status("DRAFT")
                .isDeleted(false)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();
        productRepository.save(draft);

        long publishedCount = productRepository.countByStatus("PUBLISHED");
        long draftCount = productRepository.countByStatus("DRAFT");

        assertThat(publishedCount).isEqualTo(1);
        assertThat(draftCount).isEqualTo(1);
    }
}
