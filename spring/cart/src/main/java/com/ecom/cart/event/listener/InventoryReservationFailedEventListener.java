package com.ecom.cart.event.listener;

import com.ecom.cart.domain.SagaState;
import com.ecom.cart.event.InventoryReservationFailedEvent;
import com.ecom.cart.repository.SagaRepository;
import com.ecom.cart.service.EventDeduplicator;
import org.springframework.messaging.Message;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.logging.Logger;

/**
 * Listens to InventoryReservationFailedEvent and triggers compensation.
 * This listener is invoked when inventory reservation fails and initiates the compensation flow.
 * 
 * Binding: inventoryReservationFailedEventConsumer-in-0 -> inventory-failed topic
 * Consumer group: cart-checkout-saga
 * Partition key: sagaId (ensures FIFO ordering per saga)
 */
@Component
public class InventoryReservationFailedEventListener implements Consumer<Message<InventoryReservationFailedEvent>> {

    private static final Logger logger = Logger.getLogger(InventoryReservationFailedEventListener.class.getName());

    private final SagaRepository sagaRepository;
    private final EventDeduplicator eventDeduplicator;

    public InventoryReservationFailedEventListener(SagaRepository sagaRepository, EventDeduplicator eventDeduplicator) {
        this.sagaRepository = sagaRepository;
        this.eventDeduplicator = eventDeduplicator;
    }

    @Override
    @Transactional
    public void accept(Message<InventoryReservationFailedEvent> message) {
        InventoryReservationFailedEvent event = message.getPayload();
        UUID eventId = UUID.fromString(message.getHeaders().getId().toString());
        String eventType = InventoryReservationFailedEvent.class.getSimpleName();

        logger.info("Processing InventoryReservationFailedEvent: sagaId=" + event.sagaId() + ", reason=" + event.reason());

        // Check for duplicate event
        if (eventDeduplicator.isDuplicate(eventId, eventType)) {
            logger.warning("Duplicate InventoryReservationFailedEvent received: eventId=" + eventId);
            return;
        }

        try {
            // Find and update SagaState to COMPENSATING
            SagaState sagaState = sagaRepository.findBySagaId(event.sagaId())
                .orElseThrow(() -> new RuntimeException("SagaState not found for sagaId: " + event.sagaId()));

            sagaState.setStatus(SagaState.SagaStatus.COMPENSATING);
            sagaState.setUpdatedAt(LocalDateTime.now());
            sagaRepository.save(sagaState);

            logger.info("SagaState updated: sagaId=" + event.sagaId() + ", status=COMPENSATING, reason=" + event.reason());

            // Record event as processed
            eventDeduplicator.recordProcessedEvent(eventId, eventType);

            // Note: Compensation triggering is handled by a separate saga step (not in Phase 2)
        } catch (Exception e) {
            logger.severe("Error processing InventoryReservationFailedEvent: " + e.getMessage());
            throw new RuntimeException("Failed to process InventoryReservationFailedEvent", e);
        }
    }
}
