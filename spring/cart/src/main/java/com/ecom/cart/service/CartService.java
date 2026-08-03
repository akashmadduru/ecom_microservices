package com.ecom.cart.service;

import com.ecom.cart.dto.CartItemRequest;
import com.ecom.cart.dto.CartResponse;
import com.ecom.cart.entity.Cart;
import com.ecom.cart.entity.CartItem;
import com.ecom.cart.event.AddedToCartEvent;
import com.ecom.cart.event.RemovedFromCartEvent;
import com.ecom.cart.exception.CartNotFoundException;
import com.ecom.cart.exception.InvalidCartItemException;
import com.ecom.cart.repository.CartItemRepository;
import com.ecom.cart.repository.CartRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.cloud.stream.function.StreamBridge;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class CartService {

	private final CartRepository cartRepository;
	private final CartItemRepository cartItemRepository;
	private final StreamBridge streamBridge;

	@Transactional
	public CartResponse getOrCreateCart(String userId) {
		Cart cart = cartRepository.findByUserId(userId)
				.orElseGet(() -> {
					Cart newCart = Cart.builder()
							.userId(userId)
							.build();
					return cartRepository.save(newCart);
				});
		return CartResponse.fromEntity(cart);
	}

	@Transactional(readOnly = true)
	public CartResponse getCart(Long cartId) {
		Cart cart = cartRepository.findById(cartId)
				.orElseThrow(() -> new CartNotFoundException(cartId));
		return CartResponse.fromEntity(cart);
	}

	@Transactional
	public CartResponse addItemToCart(String userId, CartItemRequest request) {
		validateCartItemRequest(request);

		Cart cart = cartRepository.findByUserId(userId)
				.orElseGet(() -> {
					Cart newCart = Cart.builder()
							.userId(userId)
							.build();
					return cartRepository.save(newCart);
				});

		// Check if item already exists
		CartItem existingItem = cartItemRepository.findByCartIdAndProductId(
				cart.getId(), request.getProductId()
		).orElse(null);

		if (existingItem != null) {
			existingItem.setQuantity(existingItem.getQuantity() + request.getQuantity());
			cartItemRepository.save(existingItem);
		} else {
			CartItem newItem = CartItem.builder()
					.cart(cart)
					.productId(request.getProductId())
					.quantity(request.getQuantity())
					.price(request.getPrice())
					.build();
			cartItemRepository.save(newItem);
		}

		// Publish AddedToCartEvent
		AddedToCartEvent event = AddedToCartEvent.builder()
				.cartId(cart.getId())
				.userId(userId)
				.productId(request.getProductId())
				.quantity(request.getQuantity())
				.price(request.getPrice())
				.timestamp(LocalDateTime.now())
				.build();

		streamBridge.send("cartEventProducer-out-0",
				MessageBuilder.withPayload(event).build());

		return CartResponse.fromEntity(cart);
	}

	@Transactional
	public CartResponse updateCartItem(Long cartId, Long itemId, Integer newQuantity) {
		if (newQuantity <= 0) {
			throw new InvalidCartItemException("Quantity must be greater than zero");
		}

		Cart cart = cartRepository.findById(cartId)
				.orElseThrow(() -> new CartNotFoundException(cartId));

		CartItem item = cartItemRepository.findById(itemId)
				.orElseThrow(() -> new CartNotFoundException("Item not found"));

		item.setQuantity(newQuantity);
		cartItemRepository.save(item);

		return CartResponse.fromEntity(cart);
	}

	@Transactional
	public CartResponse removeFromCart(String userId, Long itemId) {
		Cart cart = cartRepository.findByUserId(userId)
				.orElseThrow(() -> new CartNotFoundException("Cart not found for user: " + userId));

		CartItem item = cartItemRepository.findById(itemId)
				.orElseThrow(() -> new CartNotFoundException("Item not found"));

		Long productId = item.getProductId();
		Integer quantity = item.getQuantity();

		cartItemRepository.delete(item);

		// Publish RemovedFromCartEvent
		RemovedFromCartEvent event = RemovedFromCartEvent.builder()
				.cartId(cart.getId())
				.userId(userId)
				.productId(productId)
				.quantity(quantity)
				.timestamp(LocalDateTime.now())
				.build();

		streamBridge.send("cartEventProducer-out-0",
				MessageBuilder.withPayload(event).build());

		return CartResponse.fromEntity(cart);
	}

	@Transactional
	public CartResponse checkout(String userId) {
		Cart cart = cartRepository.findByUserId(userId)
				.orElseThrow(() -> new CartNotFoundException("Cart not found for user: " + userId));

		if (cart.getItems().isEmpty()) {
			throw new InvalidCartItemException("Cannot checkout with empty cart");
		}

		return CartResponse.fromEntity(cart);
	}

	private void validateCartItemRequest(CartItemRequest request) {
		if (request.getProductId() == null || request.getProductId() <= 0) {
			throw new InvalidCartItemException("Product ID is required and must be positive");
		}
		if (request.getQuantity() == null || request.getQuantity() <= 0) {
			throw new InvalidCartItemException("Quantity must be greater than zero");
		}
		if (request.getPrice() == null || request.getPrice().signum() <= 0) {
			throw new InvalidCartItemException("Price must be greater than zero");
		}
	}
}
