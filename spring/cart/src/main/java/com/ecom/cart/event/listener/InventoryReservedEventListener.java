package com.ecom.cart.event.listener;

import com.ecom.cart.domain.SagaState;
import com.ecom.cart.event.InventoryReservedEvent;
import com.ecom.cart.repository.SagaRepository;
import com.ecom.cart.service.EventDeduplicator;
import org.springframework.messaging.Message;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;
import java.util.function.Consumer;
import java.util.logging.Logger;

/**
 * Listens to InventoryReservedEvent and updates SagaState to SUCCESS.
 * This listener is invoked when inventory reservation succeeds.
 * 
 * Binding: inventoryReservedEventConsumer-in-0 -> inventory-reserved topic
 * Consumer group: cart-checkout-saga
 * Partition key: sagaId (ensures FIFO ordering per saga)
 */
@Component
public class InventoryReservedEventListener implements Consumer<Message<InventoryReservedEvent>> {

    private static final Logger logger = Logger.getLogger(InventoryReservedEventListener.class.getName());

    private final SagaRepository sagaRepository;
    private final EventDeduplicator eventDeduplicator;

    public InventoryReservedEventListener(SagaRepository sagaRepository, EventDeduplicator eventDeduplicator) {
        this.sagaRepository = sagaRepository;
        this.eventDeduplicator = eventDeduplicator;
    }

    @Override
    @Transactional
    public void accept(Message<InventoryReservedEvent> message) {
        InventoryReservedEvent event = message.getPayload();
        UUID eventId = UUID.fromString(message.getHeaders().getId().toString());
        String eventType = InventoryReservedEvent.class.getSimpleName();

        logger.info("Processing InventoryReservedEvent: sagaId=" + event.sagaId() + ", productId=" + event.productId());

        // Check for duplicate event
        if (eventDeduplicator.isDuplicate(eventId, eventType)) {
            logger.warning("Duplicate InventoryReservedEvent received: eventId=" + eventId);
            return;
        }

        try {
            // Find and update SagaState
            SagaState sagaState = sagaRepository.findBySagaId(event.sagaId())
                .orElseThrow(() -> new RuntimeException("SagaState not found for sagaId: " + event.sagaId()));

            sagaState.setStatus(SagaState.SagaStatus.SUCCESS);
            sagaState.setCompletedAt(java.time.LocalDateTime.now());
            sagaRepository.save(sagaState);

            logger.info("SagaState updated: sagaId=" + event.sagaId() + ", status=SUCCESS");

            // Record event as processed
            eventDeduplicator.recordProcessedEvent(eventId, eventType);
        } catch (Exception e) {
            logger.severe("Error processing InventoryReservedEvent: " + e.getMessage());
            throw new RuntimeException("Failed to process InventoryReservedEvent", e);
        }
    }
}
