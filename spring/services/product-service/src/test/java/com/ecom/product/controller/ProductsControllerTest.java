package com.ecom.product.controller;

import com.ecom.common.pagination.Page;
import com.ecom.product.dto.ProductCreateRequest;
import com.ecom.product.dto.ProductResponse;
import com.ecom.product.dto.ProductUpdateRequest;
import com.ecom.product.service.ProductService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;

import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

import static org.hamcrest.Matchers.hasSize;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * ProductControllerTest: Unit tests for ProductController.
 *
 * Tests:
 * - REST endpoints (GET, POST, PUT, DELETE)
 * - Status codes and response structure
 * - Request/response DTOs
 * - RBAC enforcement
 */
@WebMvcTest(ProductController.class)
@ActiveProfiles("test")
@DisplayName("ProductController Tests")
class ProductsControllerTest {
    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ProductService productService;

    @Autowired
    private ObjectMapper objectMapper;

    private ProductResponse testProduct;
    private ProductCreateRequest createRequest;

    @BeforeEach
    void setUp() {
        testProduct = ProductResponse.builder()
                .id(1)
                .title("Test Product")
                .slug("test-product")
                .retailPrice(new BigDecimal("99.99"))
                .discount(BigDecimal.ZERO)
                .status("PUBLISHED")
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();

        createRequest = ProductCreateRequest.builder()
                .title("Test Product")
                .retailPrice(new BigDecimal("99.99"))
                .description("A test product")
                .build();
    }

    @Test
    @DisplayName("Should list products successfully")
    void testListProducts() throws Exception {
        Page<ProductResponse> page = Page.of(List.of(testProduct), 1, 20, 1);
        when(productService.listPublishedProducts(any())).thenReturn(page);

        mockMvc.perform(get("/api/v1/products")
                .param("page", "1")
                .param("limit", "20")
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.products", hasSize(1)))
                .andExpect(jsonPath("$.products[0].title").value("Test Product"))
                .andExpect(jsonPath("$.pagination.page").value(1))
                .andExpect(jsonPath("$.pagination.total").value(1));
    }

    @Test
    @DisplayName("Should get product by ID")
    void testGetProduct() throws Exception {
        when(productService.getProductPublic(1)).thenReturn(testProduct);

        mockMvc.perform(get("/api/v1/products/1")
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.title").value("Test Product"));
    }

    @Test
    @DisplayName("Should search products")
    void testSearchProducts() throws Exception {
        Page<ProductResponse> page = Page.of(List.of(testProduct), 1, 20, 1);
        when(productService.searchProducts(anyString(), any())).thenReturn(page);

        mockMvc.perform(get("/api/v1/products/search")
                .param("q", "test")
                .param("page", "1")
                .param("limit", "20")
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.products", hasSize(1)));
    }

    @Test
    @DisplayName("Should create product with SELLER role")
    @WithMockUser(roles = "SELLER")
    void testCreateProduct() throws Exception {
        when(productService.createProduct(any(ProductCreateRequest.class), anyString()))
                .thenReturn(testProduct);

        mockMvc.perform(post("/api/v1/products")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(createRequest)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.title").value("Test Product"));
    }

    @Test
    @DisplayName("Should forbid product creation without SELLER/ADMIN role")
    void testCreateProductUnauthorized() throws Exception {
        mockMvc.perform(post("/api/v1/products")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(createRequest)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Should update product with SELLER role")
    @WithMockUser(roles = "SELLER")
    void testUpdateProduct() throws Exception {
        ProductUpdateRequest updateRequest = ProductUpdateRequest.builder()
                .title("Updated Product")
                .retailPrice(new BigDecimal("199.99"))
                .build();

        testProduct.setTitle("Updated Product");
        testProduct.setRetailPrice(new BigDecimal("199.99"));

        when(productService.updateProduct(anyInt(), any(ProductUpdateRequest.class), anyString(), anyString()))
                .thenReturn(testProduct);

        mockMvc.perform(put("/api/v1/products/1")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(updateRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Updated Product"));
    }

    @Test
    @DisplayName("Should delete product with SELLER role")
    @WithMockUser(roles = "SELLER")
    void testDeleteProduct() throws Exception {
        doNothing().when(productService).deleteProduct(anyInt(), anyString(), anyString());

        mockMvc.perform(delete("/api/v1/products/1")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isNoContent());
    }

    @Test
    @DisplayName("Should restore product with ADMIN role only")
    @WithMockUser(roles = "ADMIN")
    void testRestoreProduct() throws Exception {
        testProduct.setStatus("DELETED");
        when(productService.restoreProduct(1)).thenReturn(testProduct);

        mockMvc.perform(post("/api/v1/products/1/restore")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1));
    }

    @Test
    @DisplayName("Should forbid restore for non-ADMIN")
    @WithMockUser(roles = "SELLER")
    void testRestoreProductForbidden() throws Exception {
        mockMvc.perform(post("/api/v1/products/1/restore")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isForbidden());
    }
}
