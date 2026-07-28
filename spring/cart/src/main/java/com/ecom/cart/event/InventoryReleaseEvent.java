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
public class InventoryReleaseEvent {
	private Long reservationId;
	private Long productId;
	private Integer quantity;
	private LocalDateTime timestamp;
}
