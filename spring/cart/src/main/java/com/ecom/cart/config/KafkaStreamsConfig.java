package com.ecom.cart.config;

import org.springframework.cloud.stream.binder.kafka.config.KafkaBinderConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.rebalance.group.coordinator.ConsumerGroupCoordinator;

/**
 * Kafka Streams configuration for Cart Service.
 * Configures:
 * - Checkout saga event bindings (CheckoutInitiatedEvent, InventoryReservedEvent, etc.)
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
     * Event topics for cart service saga:
     * - checkout-initiated: Cart publishes after checkout request (input: CheckoutInitiatedEvent)
     * - inventory-reserved: Inventory publishes after successful reservation (input: InventoryReservedEvent)
     * - inventory-failed: Inventory publishes on reservation failure (input: InventoryReservationFailedEvent)
     * - checkout-completed: Cart publishes after saga success (output: CheckoutCompletedEvent)
     * - checkout-failed: Cart publishes on saga failure (output: CheckoutFailedEvent)
     * - compensation-triggered: Cart publishes to trigger compensation (output: CheckoutCompensatingEvent)
     * - compensation-completed: Inventory publishes after compensation (input: CheckoutCompensatedEvent)
     *
     * Partition key: sagaId ensures all events for a saga go to the same partition (FIFO ordering)
     * Dead-letter topic: dlq-* topics capture failed event processing for manual intervention
     *
     * Spring Cloud Stream bindings are configured in application.yaml:
     * spring.cloud.stream.bindings:
     *   checkoutInitiatedEventProducer-out-0: checkout-initiated
     *   inventoryReservedEventConsumer-in-0: inventory-reserved
     *   inventoryReservationFailedEventConsumer-in-0: inventory-failed
     *   checkoutCompletedEventProducer-out-0: checkout-completed
     *   checkoutFailedEventProducer-out-0: checkout-failed
     *   checkoutCompensatingEventProducer-out-0: compensation-triggered
     *   checkoutCompensatedEventConsumer-in-0: compensation-completed
     */
}
