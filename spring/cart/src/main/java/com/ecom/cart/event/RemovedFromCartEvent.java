package com.ecom.cart.event;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RemovedFromCartEvent {
	private Long cartId;
	private String userId;
	private Long productId;
	private Integer quantity;
	private LocalDateTime timestamp;
}
