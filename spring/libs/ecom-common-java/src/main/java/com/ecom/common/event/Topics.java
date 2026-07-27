package com.ecom.common.event;

/**
 * Kafka topic constants and utilities.
 * One topic per aggregate; the EventEnvelope's event_type discriminates.
 * Partitioning by aggregate id (partition_key) preserves per-entity ordering.
 */
public final class Topics {
    private Topics() {}

    public static final String USER = "user.events";
    public static final String PRODUCT = "product.events";
    public static final String INVENTORY = "inventory.events";
    public static final String CART = "cart.events";
    public static final String WISHLIST = "wishlist.events";
    public static final String ORDER = "order.events";
    public static final String PAYMENT = "payment.events";
    public static final String REVIEW = "review.events";
    public static final String NOTIFICATION = "notification.events";

    /**
     * Get the dead-letter queue topic for a given topic.
     */
    public static String dlq(String topic) {
        return topic + ".dlq";
    }
}
