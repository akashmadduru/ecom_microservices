package com.ecom.inventory.exception;

public class OutOfStockException extends RuntimeException {
	public OutOfStockException(String message) {
		super(message);
	}

	public OutOfStockException(Long productId, Integer requested, Integer available) {
		super(String.format("Product %d: Requested %d units but only %d available",
				productId, requested, available));
	}
}
