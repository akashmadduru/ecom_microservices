package com.ecom.products.exception;

public class ProductNotFoundException extends RuntimeException {
	public ProductNotFoundException(String message) {
		super(message);
	}

	public ProductNotFoundException(Long productId) {
		super("Product not found with ID: " + productId);
	}
}
