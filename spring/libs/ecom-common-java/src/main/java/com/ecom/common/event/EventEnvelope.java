package com.ecom.common.event;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * EventEnvelope: standard event wire format for Kafka messages, analogous to
 * python/libs/ecom_common/events.py:EventEnvelope.
 *
 * Carries a discriminated union payload: event_type discriminates the schema.
 * Partitioned by partition_key to preserve per-entity ordering.
 *
 * Note: Lombok annotations removed due to Java 25 compatibility issues.
 * Will be re-added when Lombok 1.19+ is available or Java version is downgraded to 17.
 */
public class EventEnvelope {

    @JsonProperty("event_id")
    private String eventId;

    @JsonProperty("event_type")
    private String eventType;

    @JsonProperty("event_version")
    private int eventVersion;

    @JsonProperty("occurred_at")
    private Instant occurredAt;

    @JsonProperty("producer")
    private String producer;

    @JsonProperty("correlation_id")
    private String correlationId;

    @JsonProperty("partition_key")
    private String partitionKey;

    @JsonProperty("payload")
    private Map<String, Object> payload;

    /**
     * Default constructor with sensible defaults.
     */
    public EventEnvelope() {
        this.eventId = UUID.randomUUID().toString();
        this.eventVersion = 1;
        this.occurredAt = Instant.now();
    }

    /**
     * Full constructor.
     */
    public EventEnvelope(String eventId, String eventType, int eventVersion, Instant occurredAt,
                         String producer, String correlationId, String partitionKey, Map<String, Object> payload) {
        this.eventId = eventId;
        this.eventType = eventType;
        this.eventVersion = eventVersion;
        this.occurredAt = occurredAt;
        this.producer = producer;
        this.correlationId = correlationId;
        this.partitionKey = partitionKey;
        this.payload = payload;
    }

    // Getters and Setters
    public String getEventId() {
        return eventId;
    }

    public void setEventId(String eventId) {
        this.eventId = eventId;
    }

    public String getEventType() {
        return eventType;
    }

    public void setEventType(String eventType) {
        this.eventType = eventType;
    }

    public int getEventVersion() {
        return eventVersion;
    }

    public void setEventVersion(int eventVersion) {
        this.eventVersion = eventVersion;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }

    public void setOccurredAt(Instant occurredAt) {
        this.occurredAt = occurredAt;
    }

    public String getProducer() {
        return producer;
    }

    public void setProducer(String producer) {
        this.producer = producer;
    }

    public String getCorrelationId() {
        return correlationId;
    }

    public void setCorrelationId(String correlationId) {
        this.correlationId = correlationId;
    }

    public String getPartitionKey() {
        return partitionKey;
    }

    public void setPartitionKey(String partitionKey) {
        this.partitionKey = partitionKey;
    }

    public Map<String, Object> getPayload() {
        return payload;
    }

    public void setPayload(Map<String, Object> payload) {
        this.payload = payload;
    }

    @Override
    public String toString() {
        return "EventEnvelope{" +
                "eventId='" + eventId + '\'' +
                ", eventType='" + eventType + '\'' +
                ", eventVersion=" + eventVersion +
                ", occurredAt=" + occurredAt +
                ", producer='" + producer + '\'' +
                ", correlationId='" + correlationId + '\'' +
                ", partitionKey='" + partitionKey + '\'' +
                ", payload=" + payload +
                '}';
    }
}
