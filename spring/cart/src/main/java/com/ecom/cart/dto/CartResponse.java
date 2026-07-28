package com.ecom.cart.dto;

import com.ecom.cart.entity.Cart;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CartResponse {
	private Long id;
	private String userId;
	private List<CartItemResponse> items;
	private LocalDateTime createdAt;
	private LocalDateTime updatedAt;

	public BigDecimal calculateTotal() {
		return items.stream()
				.map(item -> item.getPrice().multiply(new BigDecimal(item.getQuantity())))
				.reduce(BigDecimal.ZERO, BigDecimal::add);
	}

	public static CartResponse fromEntity(Cart cart) {
		List<CartItemResponse> items = cart.getItems().stream()
				.map(CartItemResponse::fromEntity)
				.collect(Collectors.toList());

		return CartResponse.builder()
				.id(cart.getId())
				.userId(cart.getUserId())
				.items(items)
				.createdAt(cart.getCreatedAt())
				.updatedAt(cart.getUpdatedAt())
				.build();
	}
}
