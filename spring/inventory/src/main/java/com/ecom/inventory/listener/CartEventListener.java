package com.ecom.inventory.listener;

import com.ecom.inventory.event.AddedToCartEvent;
import com.ecom.inventory.event.RemovedFromCartEvent;
import com.ecom.inventory.service.InventoryService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.stereotype.Component;

import java.util.function.Consumer;

@Component
@RequiredArgsConstructor
@Slf4j
public class CartEventListener {

	private final InventoryService inventoryService;

	/**
	 * Consumes AddedToCartEvent from cart-events topic
	 * Function name must match binding: cartEventConsumer-in-0
	 */
	@Bean
	public Consumer<AddedToCartEvent> cartEventConsumer() {
		return event -> {
			log.info("Received AddedToCartEvent: product={}, user={}, quantity={}",
					event.getProductId(), event.getUserId(), event.getQuantity());
			try {
				inventoryService.handleAddedToCartEvent(event);
			} catch (Exception e) {
				log.error("Error processing AddedToCartEvent", e);
				throw e;
			}
		};
	}

	/**
	 * Consumes RemovedFromCartEvent from cart-events topic
	 * Function name must match binding: removedFromCartEventConsumer-in-0
	 */
	@Bean
	public Consumer<RemovedFromCartEvent> removedFromCartEventConsumer() {
		return event -> {
			log.info("Received RemovedFromCartEvent: product={}, user={}, quantity={}",
					event.getProductId(), event.getUserId(), event.getQuantity());
			try {
				inventoryService.handleRemovedFromCartEvent(event);
			} catch (Exception e) {
				log.error("Error processing RemovedFromCartEvent", e);
				throw e;
			}
		};
	}
}
