package com.ecom.common.event;

/**
 * Event type constants for discriminating EventEnvelope payloads.
 * Mirrors python/libs/ecom_common/events.py:EventType.
 */
public final class EventType {
    private EventType() {}

    // User events
    public static final String USER_CREATED = "UserCreated";
    public static final String USER_UPDATED = "UserUpdated";

    // Product events
    public static final String PRODUCT_CREATED = "ProductCreated";
    public static final String PRODUCT_UPDATED = "ProductUpdated";
    public static final String PRODUCT_DELETED = "ProductDeleted";
    public static final String PRODUCT_VARIANT_CREATED = "ProductVariantCreated";

    // Inventory events
    public static final String INVENTORY_CREATED = "InventoryCreated";
    public static final String INVENTORY_RESERVED = "InventoryReserved";
    public static final String INVENTORY_RELEASED = "InventoryReleased";
    public static final String INVENTORY_UPDATED = "InventoryUpdated";
    public static final String STOCK_DEDUCTED = "StockDeducted";
    public static final String STOCK_RESTORED = "StockRestored";
    public static final String LOW_STOCK_DETECTED = "LowStockDetected";
    public static final String OUT_OF_STOCK_DETECTED = "OutOfStockDetected";

    // Cart events
    public static final String CART_CREATED = "CartCreated";
    public static final String CART_UPDATED = "CartUpdated";

    // Wishlist events
    public static final String WISHLIST_UPDATED = "WishlistUpdated";

    // Order events
    public static final String ORDER_CREATED = "OrderCreated";
    public static final String ORDER_CONFIRMED = "OrderConfirmed";
    public static final String ORDER_FAILED = "OrderFailed";
    public static final String ORDER_CANCELLED = "OrderCancelled";

    // Payment events
    public static final String PAYMENT_STARTED = "PaymentStarted";
    public static final String PAYMENT_COMPLETED = "PaymentCompleted";
    public static final String PAYMENT_FAILED = "PaymentFailed";
    public static final String REFUND_INITIATED = "RefundInitiated";
    public static final String REFUND_COMPLETED = "RefundCompleted";

    // Notification events
    public static final String NOTIFICATION_REQUESTED = "NotificationRequested";
    public static final String NOTIFICATION_SENT = "NotificationSent";

    // Review events
    public static final String REVIEW_CREATED = "ReviewCreated";
    public static final String REVIEW_UPDATED = "ReviewUpdated";
    public static final String REVIEW_DELETED = "ReviewDeleted";
}
