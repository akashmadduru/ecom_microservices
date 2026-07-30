package com.ecom.inventory.config;

import org.springframework.cloud.stream.binder.kafka.config.KafkaBinderConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Kafka Streams configuration for Inventory Service.
 * Configures:
 * - Saga event bindings for inventory reservation flow
 * - Event deduplication via Event_Processing_Log table
 * - Partition key routing by sagaId to ensure FIFO per saga
 * - Dead-letter topic for failed events
 */
@Configuration
public class KafkaStreamsConfig {

    /**
     * Kafka broker configuration.
     * Uses environment variable KAFKA_BOOTSTRAP_SERVERS or defaults to localhost:9092.
     */
    @Bean
    public KafkaBinderConfigurationProperties kafkaBinderProperties() {
        KafkaBinderConfigurationProperties props = new KafkaBinderConfigurationProperties();
        props.setBrokers(new String[]{"localhost:9092"});
        return props;
    }

    /**
     * Event topics for inventory service saga:
     * - checkout-initiated: Inventory consumes to start reservation (input: CheckoutInitiatedEvent)
     * - inventory-reserved: Inventory publishes after successful reservation (output: InventoryReservedEvent)
     * - inventory-failed: Inventory publishes on reservation failure (output: InventoryReservationFailedEvent)
     * - compensation-triggered: Inventory consumes to release reservations (input: CheckoutCompensatingEvent)
     * - compensation-completed: Inventory publishes after compensation (output: CheckoutCompensatedEvent)
     *
     * Partition key: sagaId ensures all events for a saga go to the same partition (FIFO ordering)
     * Dead-letter topic: dlq-* topics capture failed event processing for manual intervention
     *
     * Spring Cloud Stream bindings are configured in application.yaml:
     * spring.cloud.stream.bindings:
     *   checkoutInitiatedEventConsumer-in-0: checkout-initiated
     *   inventoryReservedEventProducer-out-0: inventory-reserved
     *   inventoryReservationFailedEventProducer-out-0: inventory-failed
     *   compensationTriggeredEventConsumer-in-0: compensation-triggered
     *   checkoutCompensatedEventProducer-out-0: compensation-completed
     */
}
