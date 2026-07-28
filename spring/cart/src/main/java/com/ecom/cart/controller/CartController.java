package com.ecom.cart.controller;

import com.ecom.cart.dto.CartItemRequest;
import com.ecom.cart.dto.CartResponse;
import com.ecom.cart.service.CartService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/carts")
@RequiredArgsConstructor
public class CartController {

	private final CartService cartService;

	@GetMapping("/{userId}")
	public ResponseEntity<CartResponse> getCart(@PathVariable String userId) {
		CartResponse cart = cartService.getOrCreateCart(userId);
		return ResponseEntity.ok(cart);
	}

	@PostMapping("/{userId}/items")
	public ResponseEntity<CartResponse> addItemToCart(
			@PathVariable String userId,
			@RequestBody CartItemRequest request) {
		CartResponse cart = cartService.addItemToCart(userId, request);
		return ResponseEntity.status(HttpStatus.CREATED).body(cart);
	}

	@PutMapping("/{cartId}/items/{itemId}")
	public ResponseEntity<CartResponse> updateCartItem(
			@PathVariable Long cartId,
			@PathVariable Long itemId,
			@RequestParam Integer quantity) {
		CartResponse cart = cartService.updateCartItem(cartId, itemId, quantity);
		return ResponseEntity.ok(cart);
	}

	@DeleteMapping("/{userId}/items/{itemId}")
	public ResponseEntity<CartResponse> removeFromCart(
			@PathVariable String userId,
			@PathVariable Long itemId) {
		CartResponse cart = cartService.removeFromCart(userId, itemId);
		return ResponseEntity.ok(cart);
	}

	@PostMapping("/{userId}/checkout")
	public ResponseEntity<CartResponse> checkout(@PathVariable String userId) {
		CartResponse cart = cartService.checkout(userId);
		return ResponseEntity.ok(cart);
	}
}
