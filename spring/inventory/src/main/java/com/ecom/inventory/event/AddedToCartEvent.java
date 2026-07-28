package com.ecom.inventory.event;

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
public class AddedToCartEvent {
	private Long cartId;
	private String userId;
	private Long productId;
	private Integer quantity;
	private BigDecimal price;
	private LocalDateTime timestamp;
}
