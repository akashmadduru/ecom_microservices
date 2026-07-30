package com.ecom.cart.event.listener;

import com.ecom.cart.domain.SagaState;
import com.ecom.cart.event.CheckoutInitiatedEvent;
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
 * Listens to CheckoutInitiatedEvent and creates SagaState entity.
 * This listener is invoked when a checkout is initiated and starts the saga.
 * 
 * Binding: checkoutInitiatedEventConsumer-in-0 -> checkout-initiated topic
 * Consumer group: cart-checkout-saga
 * Partition key: sagaId (ensures FIFO ordering per saga)
 */
@Component
public class CheckoutInitiatedEventListener implements Consumer<Message<CheckoutInitiatedEvent>> {

    private static final Logger logger = Logger.getLogger(CheckoutInitiatedEventListener.class.getName());

    private final SagaRepository sagaRepository;
    private final EventDeduplicator eventDeduplicator;

    public CheckoutInitiatedEventListener(SagaRepository sagaRepository, EventDeduplicator eventDeduplicator) {
        this.sagaRepository = sagaRepository;
        this.eventDeduplicator = eventDeduplicator;
    }

    @Override
    @Transactional
    public void accept(Message<CheckoutInitiatedEvent> message) {
        CheckoutInitiatedEvent event = message.getPayload();
        UUID eventId = UUID.fromString(message.getHeaders().getId().toString());
        String eventType = CheckoutInitiatedEvent.class.getSimpleName();

        logger.info("Processing CheckoutInitiatedEvent: sagaId=" + event.sagaId() + ", cartId=" + event.cartId());

        // Check for duplicate event
        if (eventDeduplicator.isDuplicate(eventId, eventType)) {
            logger.warning("Duplicate CheckoutInitiatedEvent received: eventId=" + eventId);
            return;
        }

        try {
            // Create and persist SagaState
            SagaState sagaState = new SagaState(
                event.sagaId(),
                event.cartId(),
                SagaState.SagaStatus.INITIATED
            );
            sagaState.setStartedAt(LocalDateTime.now());

            sagaRepository.save(sagaState);
            logger.info("SagaState created: sagaId=" + event.sagaId() + ", status=INITIATED");

            // Record event as processed
            eventDeduplicator.recordProcessedEvent(eventId, eventType);
        } catch (Exception e) {
            logger.severe("Error processing CheckoutInitiatedEvent: " + e.getMessage());
            throw new RuntimeException("Failed to process CheckoutInitiatedEvent", e);
        }
    }
}
