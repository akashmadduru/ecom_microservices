package com.ecom.inventory.event.listener;

import com.ecom.cart.event.CheckoutCompensatingEvent;
import com.ecom.inventory.domain.SagaReservation;
import com.ecom.inventory.repository.ReservationRepository;
import com.ecom.inventory.service.EventDeduplicator;
import org.springframework.messaging.Message;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.logging.Logger;

/**
 * Listens to CheckoutCompensatingEvent and releases reservations.
 * This listener is invoked during compensation when checkout fails.
 * 
 * Binding: compensationTriggeredEventConsumer-in-0 -> compensation-triggered topic
 * Consumer group: inventory-compensation-saga
 * Partition key: sagaId (ensures FIFO ordering per saga)
 */
@Component
public class CompensationTriggeredEventListener implements Consumer<Message<CheckoutCompensatingEvent>> {

    private static final Logger logger = Logger.getLogger(CompensationTriggeredEventListener.class.getName());

    private final ReservationRepository reservationRepository;
    private final EventDeduplicator eventDeduplicator;

    public CompensationTriggeredEventListener(ReservationRepository reservationRepository, EventDeduplicator eventDeduplicator) {
        this.reservationRepository = reservationRepository;
        this.eventDeduplicator = eventDeduplicator;
    }

    @Override
    @Transactional
    public void accept(Message<CheckoutCompensatingEvent> message) {
        CheckoutCompensatingEvent event = message.getPayload();
        UUID eventId = UUID.fromString(message.getHeaders().getId().toString());
        String eventType = CheckoutCompensatingEvent.class.getSimpleName();

        logger.info("Processing CheckoutCompensatingEvent: sagaId=" + event.sagaId() + ", reason=" + event.reason());

        // Check for duplicate event
        if (eventDeduplicator.isDuplicate(eventId, eventType)) {
            logger.warning("Duplicate CheckoutCompensatingEvent received: eventId=" + eventId);
            return;
        }

        try {
            // Find all reservations for this saga
            List<SagaReservation> reservations = reservationRepository.findBySagaId(event.sagaId());

            if (reservations.isEmpty()) {
                logger.warning("No reservations found for sagaId: " + event.sagaId());
            } else {
                // Release all reservations
                for (SagaReservation reservation : reservations) {
                    if (reservation.getStatus() == SagaReservation.ReservationStatus.RESERVED) {
                        reservation.setStatus(SagaReservation.ReservationStatus.RELEASED);
                        reservationRepository.save(reservation);
                        logger.info("Reservation released: reservationId=" + reservation.getReservationId() + ", productId=" + reservation.getProductId());
                    }
                }
            }

            logger.info("Compensation completed for sagaId: " + event.sagaId());

            // Record event as processed
            eventDeduplicator.recordProcessedEvent(eventId, eventType);
        } catch (Exception e) {
            logger.severe("Error processing CheckoutCompensatingEvent: " + e.getMessage());
            throw new RuntimeException("Failed to process CheckoutCompensatingEvent", e);
        }
    }
}
