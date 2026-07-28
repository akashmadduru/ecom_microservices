package com.ecom.cart.event;

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
public class CheckoutInitiatedEvent {
	private Long cartId;
	private String userId;
	private BigDecimal totalAmount;
	private LocalDateTime timestamp;
}
