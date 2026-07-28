package com.ecom.cart.metrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicInteger;

/**
 * Custom business metrics for the Cart Service.
 * Tracks: items added, checkouts initiated, cart values.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class CartMetrics {

    private final MeterRegistry meterRegistry;

    // Gauges for current state
    private final AtomicInteger activeCartCount = new AtomicInteger(0);
    private final AtomicInteger totalCartItems = new AtomicInteger(0);

    /**
     * Record when items are added to cart.
     *
     * @param userId User who added item
     * @param productId Product that was added
     * @param quantity Quantity added
     */
    public void recordItemAdded(String userId, String productId, int quantity) {
        Counter.builder("cart.items.added")
            .tag("user_id", userId)
            .tag("product_id", productId)
            .tag("quantity", String.valueOf(quantity))
            .description("Total items added to carts")
            .register(meterRegistry)
            .increment();

        totalCartItems.addAndGet(quantity);
        log.debug("Recorded item added: product={}, user={}, quantity={}", productId, userId, quantity);
    }

    /**
     * Record when items are removed from cart.
     *
     * @param userId User who removed item
     * @param productId Product that was removed
     * @param quantity Quantity removed
     */
    public void recordItemRemoved(String userId, String productId, int quantity) {
        Counter.builder("cart.items.removed")
            .tag("user_id", userId)
            .tag("product_id", productId)
            .tag("quantity", String.valueOf(quantity))
            .description("Total items removed from carts")
            .register(meterRegistry)
            .increment();

        totalCartItems.addAndGet(-quantity);
        log.debug("Recorded item removed: product={}, user={}, quantity={}", productId, userId, quantity);
    }

    /**
     * Record checkout initiation.
     *
     * @param userId User initiating checkout
     * @param cartValue Cart total value
     * @param itemCount Number of items in cart
     */
    public void recordCheckoutInitiated(String userId, double cartValue, int itemCount) {
        Counter.builder("cart.checkout.initiated")
            .tag("user_id", userId)
            .tag("status", "initiated")
            .description("Total checkout operations initiated")
            .register(meterRegistry)
            .increment();

        // Record cart value as a separate metric
        io.micrometer.core.instrument.Timer.builder("cart.checkout.value")
            .tag("user_id", userId)
            .publishPercentiles(0.5, 0.95, 0.99)
            .register(meterRegistry)
            .record((long) cartValue, java.util.concurrent.TimeUnit.MILLISECONDS);

        log.debug("Recorded checkout: user={}, value={}, items={}", userId, cartValue, itemCount);
    }

    /**
     * Record checkout completion.
     *
     * @param userId User who completed checkout
     * @param status Checkout status (completed, failed)
     * @param cartValue Cart total value
     */
    public void recordCheckoutCompleted(String userId, String status, double cartValue) {
        Counter.builder("cart.checkout.completed")
            .tag("user_id", userId)
            .tag("status", status)
            .description("Total checkout operations completed")
            .register(meterRegistry)
            .increment();

        log.debug("Recorded checkout completion: user={}, status={}, value={}", userId, status, cartValue);
    }

    /**
     * Register gauge for active cart count.
     * Should be called at startup.
     */
    public void registerActiveCartGauge() {
        Gauge.builder("cart.active.count", activeCartCount, AtomicInteger::get)
            .description("Number of active shopping carts")
            .register(meterRegistry);
    }

    /**
     * Register gauge for total cart items.
     * Should be called at startup.
     */
    public void registerTotalItemsGauge() {
        Gauge.builder("cart.items.total", totalCartItems, AtomicInteger::get)
            .description("Total items across all carts")
            .register(meterRegistry);
    }

    /**
     * Update active cart count.
     * Called when carts are loaded from database.
     *
     * @param count Number of active carts
     */
    public void setActiveCartCount(int count) {
        activeCartCount.set(count);
    }

    /**
     * Update total items count.
     * Called when cart items are loaded from database.
     *
     * @param count Total number of items
     */
    public void setTotalItemsCount(int count) {
        totalCartItems.set(count);
    }
}
