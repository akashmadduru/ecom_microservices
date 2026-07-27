package com.ecom.product.service;

import com.ecom.common.exception.ConflictException;
import com.ecom.common.exception.ForbiddenException;
import com.ecom.common.exception.NotFoundException;
import com.ecom.common.exception.ValidationException;
import com.ecom.common.pagination.Page;
import com.ecom.common.pagination.PageRequest;
import com.ecom.product.dto.ProductCreateRequest;
import com.ecom.product.dto.ProductResponse;
import com.ecom.product.dto.ProductUpdateRequest;
import com.ecom.product.model.Product;
import com.ecom.product.repository.ProductRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * ProductServiceTest: Unit tests for ProductService.
 *
 * Tests:
 * - CRUD operations
 * - Soft-delete and restore
 * - RBAC enforcement
 * - Search functionality
 * - Slug generation
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("ProductService Tests")
class ProductServiceTest {
    @Mock
    private ProductRepository productRepository;

    @Mock
    private KafkaTemplate kafkaTemplate;

    @InjectMocks
    private ProductService productService;

    private Product testProduct;
    private ProductCreateRequest createRequest;

    @BeforeEach
    void setUp() {
        testProduct = Product.builder()
                .id(1)
                .title("Test Product")
                .slug("test-product")
                .description("A test product")
                .retailPrice(new BigDecimal("99.99"))
                .discount(BigDecimal.ZERO)
                .status("PUBLISHED")
                .isDeleted(false)
                .sellerId("user123")
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();

        createRequest = ProductCreateRequest.builder()
                .title("Test Product")
                .retailPrice(new BigDecimal("99.99"))
                .description("A test product")
                .build();

        mockSecurityContext("user123");
    }

    private void mockSecurityContext(String userId) {
        Authentication auth = mock(Authentication.class);
        when(auth.getName()).thenReturn(userId);
        SecurityContext context = mock(SecurityContext.class);
        when(context.getAuthentication()).thenReturn(auth);
        SecurityContextHolder.setContext(context);
    }

    @Test
    @DisplayName("Should create product successfully")
    void testCreateProduct() {
        when(productRepository.existsBySlug(anyString())).thenReturn(false);
        when(productRepository.save(any(Product.class))).thenReturn(testProduct);

        ProductResponse response = productService.createProduct(createRequest, "user123");

        assertThat(response).isNotNull();
        assertThat(response.getTitle()).isEqualTo("Test Product");
        assertThat(response.getStatus()).isEqualTo("DRAFT");
    }

    @Test
    @DisplayName("Should throw ConflictException on duplicate slug")
    void testCreateProductDuplicateSlug() {
        createRequest.setSlug("test-product");
        when(productRepository.existsBySlug("test-product")).thenReturn(true);

        assertThatThrownBy(() -> productService.createProduct(createRequest, "user123"))
                .isInstanceOf(ConflictException.class)
                .hasMessage("Product with this slug already exists");
    }

    @Test
    @DisplayName("Should throw ValidationException on empty title")
    void testCreateProductEmptyTitle() {
        createRequest.setTitle("");

        assertThatThrownBy(() -> productService.createProduct(createRequest, "user123"))
                .isInstanceOf(ValidationException.class)
                .hasMessage("Title is required");
    }

    @Test
    @DisplayName("Should get published product for public user")
    void testGetProductPublic() {
        when(productRepository.findById(1)).thenReturn(Optional.of(testProduct));

        ProductResponse response = productService.getProductPublic(1);

        assertThat(response).isNotNull();
        assertThat(response.getTitle()).isEqualTo("Test Product");
    }

    @Test
    @DisplayName("Should throw NotFoundException for soft-deleted product")
    void testGetProductNotFound() {
        testProduct.setIsDeleted(true);
        when(productRepository.findById(1)).thenReturn(Optional.of(testProduct));

        assertThatThrownBy(() -> productService.getProductPublic(1))
                .isInstanceOf(NotFoundException.class)
                .hasMessage("Product not found");
    }

    @Test
    @DisplayName("Should soft-delete product successfully")
    void testSoftDeleteProduct() {
        when(productRepository.findById(1)).thenReturn(Optional.of(testProduct));
        when(productRepository.save(any(Product.class))).thenReturn(testProduct);

        productService.deleteProduct(1, "user123", "SELLER");

        ArgumentCaptor<Product> captor = ArgumentCaptor.forClass(Product.class);
        verify(productRepository).save(captor.capture());
        assertThat(captor.getValue().getIsDeleted()).isTrue();
        assertThat(captor.getValue().getDeletedBy()).isEqualTo("user123");
    }

    @Test
    @DisplayName("Should enforce RBAC: seller cannot delete other's product")
    void testDeleteProductForbiddenForSeller() {
        testProduct.setSellerId("other-user");
        when(productRepository.findById(1)).thenReturn(Optional.of(testProduct));

        assertThatThrownBy(() -> productService.deleteProduct(1, "user123", "SELLER"))
                .isInstanceOf(ForbiddenException.class)
                .hasMessage("You can only delete your own products");
    }

    @Test
    @DisplayName("Should list published products with pagination")
    void testListPublishedProducts() {
        PageRequest pageRequest = new PageRequest(1, 20);
        org.springframework.data.domain.Page<Product> mockPage = new PageImpl<>(
                List.of(testProduct)
        );
        when(productRepository.findAllPublished(any())).thenReturn(mockPage);

        Page<ProductResponse> response = productService.listPublishedProducts(pageRequest);

        assertThat(response).isNotNull();
        assertThat(response.getData()).hasSize(1);
        assertThat(response.getPage()).isEqualTo(1);
        assertThat(response.getLimit()).isEqualTo(20);
    }

    @Test
    @DisplayName("Should search products with full-text query")
    void testSearchProducts() {
        PageRequest pageRequest = new PageRequest(1, 20);
        org.springframework.data.domain.Page<Product> mockPage = new PageImpl<>(
                List.of(testProduct)
        );
        when(productRepository.findByFullTextSearchPrefix(anyString(), any())).thenReturn(mockPage);

        Page<ProductResponse> response = productService.searchProducts("test", pageRequest);

        assertThat(response).isNotNull();
        assertThat(response.getData()).hasSize(1);
    }

    @Test
    @DisplayName("Should throw ValidationException on empty search query")
    void testSearchProductsEmptyQuery() {
        PageRequest pageRequest = new PageRequest(1, 20);

        assertThatThrownBy(() -> productService.searchProducts("", pageRequest))
                .isInstanceOf(ValidationException.class)
                .hasMessage("Search query cannot be empty");
    }
}
