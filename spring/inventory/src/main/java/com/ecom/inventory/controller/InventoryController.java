package com.ecom.inventory.controller;

import com.ecom.inventory.dto.InventoryResponse;
import com.ecom.inventory.dto.ReservationResponse;
import com.ecom.inventory.service.InventoryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/inventory")
@RequiredArgsConstructor
public class InventoryController {

	private final InventoryService inventoryService;

	@GetMapping("/{productId}")
	public ResponseEntity<InventoryResponse> getInventory(@PathVariable Long productId) {
		InventoryResponse inventory = inventoryService.getInventory(productId);
		return ResponseEntity.ok(inventory);
	}

	@GetMapping("/reserved/{userId}")
	public ResponseEntity<List<ReservationResponse>> getReservedItems(@PathVariable String userId) {
		List<ReservationResponse> reservations = inventoryService.getReservedItems(userId);
		return ResponseEntity.ok(reservations);
	}

	@PutMapping("/{productId}/reserve")
	public ResponseEntity<Void> manualReserveStock(
			@PathVariable Long productId,
			@RequestParam String userId,
			@RequestParam Integer quantity) {
		// This endpoint can be extended for manual stock reservation if needed
		inventoryService.releaseReservation(productId, userId, quantity);
		return ResponseEntity.ok().build();
	}
}
