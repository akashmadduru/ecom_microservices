package com.ecom.inventory.event;

import java.util.Objects;
import java.util.UUID;

public class IdempotencyKey {
    private final UUID eventId;
    private final String eventType;

    public IdempotencyKey(UUID eventId, String eventType) {
        this.eventId = eventId;
        this.eventType = eventType;
    }

    public UUID getEventId() {
        return eventId;
    }

    public String getEventType() {
        return eventType;
    }

    @Override
    public String toString() {
        return "IdempotencyKey{" +
                "eventId=" + eventId +
                ", eventType='" + eventType + '\'' +
                '}';
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        IdempotencyKey that = (IdempotencyKey) o;
        return Objects.equals(eventId, that.eventId) &&
                Objects.equals(eventType, that.eventType);
    }

    @Override
    public int hashCode() {
        return Objects.hash(eventId, eventType);
    }
}
