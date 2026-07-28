package com.ecom.cart.dto;

import com.ecom.cart.entity.CartItem;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CartItemResponse {
	private Long id;
	private Long productId;
	private Integer quantity;
	private BigDecimal price;
	private LocalDateTime addedAt;

	public static CartItemResponse fromEntity(CartItem item) {
		return CartItemResponse.builder()
				.id(item.getId())
				.productId(item.getProductId())
				.quantity(item.getQuantity())
				.price(item.getPrice())
				.addedAt(item.getAddedAt())
				.build();
	}
}
