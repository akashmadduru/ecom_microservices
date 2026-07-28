package com.ecom.inventory.event;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class InventoryReservedEvent {
	private Long reservationId;
	private Long productId;
	private String userId;
	private Integer quantity;
	private Boolean success;
	private String reason;
	private LocalDateTime timestamp;
}
