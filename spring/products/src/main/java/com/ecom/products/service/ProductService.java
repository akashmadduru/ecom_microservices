package com.ecom.products.service;

import com.ecom.products.dto.ProductRequest;
import com.ecom.products.dto.ProductResponse;
import com.ecom.products.entity.Product;
import com.ecom.products.exception.InvalidProductException;
import com.ecom.products.exception.ProductNotFoundException;
import com.ecom.products.repository.ProductRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ProductService {

	private final ProductRepository productRepository;

	@Transactional(readOnly = true)
	public List<ProductResponse> getAllProducts() {
		return productRepository.findAll().stream()
				.map(ProductResponse::fromEntity)
				.collect(Collectors.toList());
	}

	@Transactional(readOnly = true)
	public Page<ProductResponse> getProductsPage(int page, int size) {
		Pageable pageable = PageRequest.of(page, size);
		return productRepository.findAll(pageable)
				.map(ProductResponse::fromEntity);
	}

	@Transactional(readOnly = true)
	public ProductResponse getProductById(Long id) {
		Product product = productRepository.findById(id)
				.orElseThrow(() -> new ProductNotFoundException(id));
		return ProductResponse.fromEntity(product);
	}

	@Transactional
	public ProductResponse createProduct(ProductRequest request) {
		validateProductRequest(request);

		Product product = Product.builder()
				.name(request.getName())
				.description(request.getDescription())
				.price(request.getPrice())
				.stock(request.getStock())
				.build();

		Product savedProduct = productRepository.save(product);
		return ProductResponse.fromEntity(savedProduct);
	}

	@Transactional
	public ProductResponse updateProduct(Long id, ProductRequest request) {
		Product product = productRepository.findById(id)
				.orElseThrow(() -> new ProductNotFoundException(id));

		validateProductRequest(request);

		product.setName(request.getName());
		product.setDescription(request.getDescription());
		product.setPrice(request.getPrice());
		product.setStock(request.getStock());

		Product updatedProduct = productRepository.save(product);
		return ProductResponse.fromEntity(updatedProduct);
	}

	@Transactional
	public void deleteProduct(Long id) {
		Product product = productRepository.findById(id)
				.orElseThrow(() -> new ProductNotFoundException(id));
		productRepository.delete(product);
	}

	private void validateProductRequest(ProductRequest request) {
		if (request.getName() == null || request.getName().isBlank()) {
			throw new InvalidProductException("Product name is required");
		}
		if (request.getPrice() == null || request.getPrice().signum() <= 0) {
			throw new InvalidProductException("Product price must be greater than zero");
		}
		if (request.getStock() == null || request.getStock() < 0) {
			throw new InvalidProductException("Product stock cannot be negative");
		}
	}
}
