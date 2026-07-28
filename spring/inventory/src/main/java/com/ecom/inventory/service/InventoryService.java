package com.ecom.inventory.service;

import com.ecom.inventory.dto.InventoryResponse;
import com.ecom.inventory.dto.ReservationResponse;
import com.ecom.inventory.entity.Inventory;
import com.ecom.inventory.entity.Reservation;
import com.ecom.inventory.event.AddedToCartEvent;
import com.ecom.inventory.event.InventoryReservedEvent;
import com.ecom.inventory.event.InventoryReleaseEvent;
import com.ecom.inventory.event.RemovedFromCartEvent;
import com.ecom.inventory.exception.InventoryNotFoundException;
import com.ecom.inventory.exception.OutOfStockException;
import com.ecom.inventory.repository.InventoryRepository;
import com.ecom.inventory.repository.ReservationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.stream.function.StreamBridge;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class InventoryService {

	private final InventoryRepository inventoryRepository;
	private final ReservationRepository reservationRepository;
	private final StreamBridge streamBridge;

	@Transactional(readOnly = true)
	public InventoryResponse getInventory(Long productId) {
		Inventory inventory = inventoryRepository.findByProductId(productId)
				.orElseThrow(() -> new InventoryNotFoundException(productId));
		return InventoryResponse.fromEntity(inventory);
	}

	@Transactional(readOnly = true)
	public List<ReservationResponse> getReservedItems(String userId) {
		List<Reservation> reservations = reservationRepository.findByUserIdAndIsReleasedFalse(userId);
		return reservations.stream()
				.map(ReservationResponse::fromEntity)
				.collect(Collectors.toList());
	}

	@Transactional
	public void handleAddedToCartEvent(AddedToCartEvent event) {
		log.info("Processing AddedToCartEvent for product {} from user {}",
				event.getProductId(), event.getUserId());

		// Get inventory for the product
		Inventory inventory = inventoryRepository.findByProductId(event.getProductId())
				.orElse(null);

		if (inventory == null) {
			// Create new inventory if doesn't exist
			inventory = Inventory.builder()
					.productId(event.getProductId())
					.availableStock(0)
					.reservedStock(0)
					.build();
			inventory = inventoryRepository.save(inventory);
		}

		// Check if we have enough stock
		if (inventory.getAvailableStock() < event.getQuantity()) {
			publishInventoryReservedEvent(null, event.getProductId(), event.getUserId(),
					event.getQuantity(), false,
					"Insufficient stock. Available: " + inventory.getAvailableStock());
			return;
		}

		// Reserve the stock
		inventory.setAvailableStock(inventory.getAvailableStock() - event.getQuantity());
		inventory.setReservedStock(inventory.getReservedStock() + event.getQuantity());
		inventory = inventoryRepository.save(inventory);

		// Create reservation record
		Reservation reservation = Reservation.builder()
				.productId(event.getProductId())
				.userId(event.getUserId())
				.quantity(event.getQuantity())
				.build();
		reservation = reservationRepository.save(reservation);

		// Publish success event
		publishInventoryReservedEvent(reservation.getId(), event.getProductId(),
				event.getUserId(), event.getQuantity(), true, null);
	}

	@Transactional
	public void handleRemovedFromCartEvent(RemovedFromCartEvent event) {
		log.info("Processing RemovedFromCartEvent for product {} from user {}",
				event.getProductId(), event.getUserId());

		// Release the reserved stock
		releaseReservation(event.getProductId(), event.getUserId(), event.getQuantity());
	}

	@Transactional
	public void releaseReservation(Long productId, String userId, Integer quantity) {
		// Find active reservations for this user and product
		List<Reservation> reservations = reservationRepository.findByProductIdAndIsReleasedFalse(productId);
		Reservation userReservation = reservations.stream()
				.filter(r -> r.getUserId().equals(userId))
				.findFirst()
				.orElse(null);

		if (userReservation == null) {
			log.warn("No active reservation found for product {} and user {}", productId, userId);
			return;
		}

		// Release the reserved stock
		Inventory inventory = inventoryRepository.findByProductId(productId)
				.orElseThrow(() -> new InventoryNotFoundException(productId));

		inventory.setReservedStock(inventory.getReservedStock() - quantity);
		inventory.setAvailableStock(inventory.getAvailableStock() + quantity);
		inventoryRepository.save(inventory);

		// Mark reservation as released
		userReservation.setIsReleased(true);
		reservationRepository.save(userReservation);

		// Publish release event
		InventoryReleaseEvent event = InventoryReleaseEvent.builder()
				.reservationId(userReservation.getId())
				.productId(productId)
				.quantity(quantity)
				.timestamp(LocalDateTime.now())
				.build();

		streamBridge.send("inventoryEventProducer-out-0",
				MessageBuilder.withPayload(event).build());
	}

	private void publishInventoryReservedEvent(Long reservationId, Long productId, String userId,
											   Integer quantity, Boolean success, String reason) {
		InventoryReservedEvent event = InventoryReservedEvent.builder()
				.reservationId(reservationId)
				.productId(productId)
				.userId(userId)
				.quantity(quantity)
				.success(success)
				.reason(reason)
				.timestamp(LocalDateTime.now())
				.build();

		streamBridge.send("inventoryEventProducer-out-0",
				MessageBuilder.withPayload(event).build());
	}
}
