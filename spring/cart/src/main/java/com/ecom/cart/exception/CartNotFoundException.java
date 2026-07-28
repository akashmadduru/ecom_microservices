package com.ecom.cart.exception;

public class CartNotFoundException extends RuntimeException {
	public CartNotFoundException(String message) {
		super(message);
	}

	public CartNotFoundException(Long cartId) {
		super("Cart not found with ID: " + cartId);
	}
}
