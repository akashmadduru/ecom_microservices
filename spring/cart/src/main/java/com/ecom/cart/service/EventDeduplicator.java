package com.ecom.cart.service;

import org.springframework.stereotype.Service;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.transaction.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

@Service
public class EventDeduplicator {

    @PersistenceContext
    private EntityManager entityManager;

    @Transactional
    public boolean isDuplicate(UUID eventId, String eventType) {
        String query = "SELECT COUNT(e) FROM EventProcessingLog e WHERE e.eventId = :eventId AND e.eventType = :eventType";
        Long count = (Long) entityManager.createQuery(query)
            .setParameter("eventId", eventId)
            .setParameter("eventType", eventType)
            .getSingleResult();
        return count > 0;
    }

    @Transactional
    public void recordProcessedEvent(UUID eventId, String eventType) {
        String sql = "INSERT INTO event_processing_log (event_id, event_type, processed_at) VALUES (:eventId, :eventType, :processedAt)";
        try {
            entityManager.createNativeQuery(sql)
                .setParameter("eventId", eventId.toString())
                .setParameter("eventType", eventType)
                .setParameter("processedAt", LocalDateTime.now())
                .executeUpdate();
        } catch (Exception e) {
            // If insertion fails (already exists), it's safe to ignore as it's idempotent
        }
    }
}
