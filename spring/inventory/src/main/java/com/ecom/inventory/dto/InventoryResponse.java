package com.ecom.inventory.dto;

import com.ecom.inventory.entity.Inventory;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class InventoryResponse {
	private Long id;
	private Long productId;
	private Integer availableStock;
	private Integer reservedStock;
	private LocalDateTime lastUpdated;

	public static InventoryResponse fromEntity(Inventory inventory) {
		return InventoryResponse.builder()
				.id(inventory.getId())
				.productId(inventory.getProductId())
				.availableStock(inventory.getAvailableStock())
				.reservedStock(inventory.getReservedStock())
				.lastUpdated(inventory.getLastUpdated())
				.build();
	}
}
