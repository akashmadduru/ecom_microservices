package com.ecom.products.controller;

import com.ecom.products.dto.ProductRequest;
import com.ecom.products.dto.ProductResponse;
import com.ecom.products.service.ProductService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(ProductController.class)
class ProductControllerTest {

	@Autowired
	private MockMvc mockMvc;

	@MockBean
	private ProductService productService;

	@Test
	void testGetAllProducts() throws Exception {
		mockMvc.perform(get("/api/v1/products"))
				.andExpect(status().isOk())
				.andExpect(content().contentType(MediaType.APPLICATION_JSON));
	}

	@Test
	void testGetProductById() throws Exception {
		ProductResponse product = ProductResponse.builder()
				.id(1L)
				.name("Test Product")
				.description("A test product")
				.price(BigDecimal.valueOf(99.99))
				.stock(10)
				.createdAt(LocalDateTime.now())
				.build();

		when(productService.getProductById(1L)).thenReturn(product);

		mockMvc.perform(get("/api/v1/products/1"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(1))
				.andExpect(jsonPath("$.name").value("Test Product"));
	}

	@Test
	void testCreateProduct() throws Exception {
		ProductRequest request = ProductRequest.builder()
				.name("New Product")
				.description("A new product")
				.price(BigDecimal.valueOf(49.99))
				.stock(20)
				.build();

		ProductResponse response = ProductResponse.builder()
				.id(2L)
				.name("New Product")
				.description("A new product")
				.price(BigDecimal.valueOf(49.99))
				.stock(20)
				.createdAt(LocalDateTime.now())
				.build();

		when(productService.createProduct(any())).thenReturn(response);

		mockMvc.perform(post("/api/v1/products")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"name\":\"New Product\",\"description\":\"A new product\",\"price\":49.99,\"stock\":20}"))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.id").value(2));
	}
}
