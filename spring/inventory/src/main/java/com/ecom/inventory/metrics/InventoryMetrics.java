package com.ecom.inventory.metrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicInteger;

/**
 * Custom business metrics for the Inventory Service.
 * Tracks: reservations, stock levels, low inventory alerts.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class InventoryMetrics {

    private final MeterRegistry meterRegistry;

    // Gauges for current state
    private final AtomicInteger activeReservations = new AtomicInteger(0);
    private final AtomicInteger lowStockAlerts = new AtomicInteger(0);
    private final AtomicInteger totalStock = new AtomicInteger(0);

    /**
     * Record when inventory is reserved.
     *
     * @param productId Product ID reserved
     * @param quantity Quantity reserved
     * @param reservationId Reservation ID
     */
    public void recordReservation(String productId, int quantity, String reservationId) {
        Counter.builder("inventory.reservations.created")
            .tag("product_id", productId)
            .tag("quantity", String.valueOf(quantity))
            .tag("status", "created")
            .description("Total inventory reservations created")
            .register(meterRegistry)
            .increment();

        activeReservations.incrementAndGet();
        log.debug("Recorded reservation: product={}, quantity={}, reservation={}", productId, quantity, reservationId);
    }

    /**
     * Record when a reservation is released.
     *
     * @param productId Product ID
     * @param quantity Quantity released
     * @param reason Reason for release (completed, cancelled, expired)
     */
    public void recordReservationReleased(String productId, int quantity, String reason) {
        Counter.builder("inventory.reservations.released")
            .tag("product_id", productId)
            .tag("quantity", String.valueOf(quantity))
            .tag("reason", reason)
            .description("Total inventory reservations released")
            .register(meterRegistry)
            .increment();

        activeReservations.decrementAndGet();
        log.debug("Recorded reservation released: product={}, quantity={}, reason={}", productId, quantity, reason);
    }

    /**
     * Record low inventory alert.
     *
     * @param productId Product ID with low stock
     * @param currentStock Current stock level
     * @param thresholdLevel Threshold that triggered alert
     */
    public void recordLowStockAlert(String productId, int currentStock, int thresholdLevel) {
        Counter.builder("inventory.low_stock.alerts")
            .tag("product_id", productId)
            .tag("current_stock", String.valueOf(currentStock))
            .tag("threshold", String.valueOf(thresholdLevel))
            .description("Low inventory stock alerts triggered")
            .register(meterRegistry)
            .increment();

        lowStockAlerts.incrementAndGet();
        log.warn("Low stock alert: product={}, current={}, threshold={}", productId, currentStock, thresholdLevel);
    }

    /**
     * Record inventory replenishment.
     *
     * @param productId Product ID replenished
     * @param quantity Quantity added
     * @param source Source of replenishment (supplier, return, adjustment)
     */
    public void recordReplenishment(String productId, int quantity, String source) {
        Counter.builder("inventory.replenished")
            .tag("product_id", productId)
            .tag("quantity", String.valueOf(quantity))
            .tag("source", source)
            .description("Total inventory replenishments")
            .register(meterRegistry)
            .increment();

        totalStock.addAndGet(quantity);
        log.debug("Recorded replenishment: product={}, quantity={}, source={}", productId, quantity, source);
    }

    /**
     * Record inventory adjustment.
     *
     * @param productId Product ID
     * @param quantityChange Change amount (positive or negative)
     * @param reason Reason for adjustment
     */
    public void recordStockAdjustment(String productId, int quantityChange, String reason) {
        Counter.builder("inventory.adjustments")
            .tag("product_id", productId)
            .tag("change", quantityChange > 0 ? "positive" : "negative")
            .tag("reason", reason)
            .description("Total inventory adjustments")
            .register(meterRegistry)
            .increment();

        totalStock.addAndGet(quantityChange);
        log.debug("Recorded adjustment: product={}, change={}, reason={}", productId, quantityChange, reason);
    }

    /**
     * Register gauge for active reservations.
     * Should be called at startup.
     */
    public void registerActiveReservationsGauge() {
        Gauge.builder("inventory.reservations.active", activeReservations, AtomicInteger::get)
            .description("Number of active inventory reservations")
            .register(meterRegistry);
    }

    /**
     * Register gauge for low stock alerts.
     * Should be called at startup.
     */
    public void registerLowStockAlertsGauge() {
        Gauge.builder("inventory.low_stock.count", lowStockAlerts, AtomicInteger::get)
            .description("Number of products with low stock")
            .register(meterRegistry);
    }

    /**
     * Register gauge for total stock.
     * Should be called at startup.
     */
    public void registerTotalStockGauge() {
        Gauge.builder("inventory.stock.total", totalStock, AtomicInteger::get)
            .description("Total inventory stock across all products")
            .register(meterRegistry);
    }

    /**
     * Update active reservations count.
     *
     * @param count Number of active reservations
     */
    public void setActiveReservations(int count) {
        activeReservations.set(count);
    }

    /**
     * Update low stock alert count.
     *
     * @param count Number of products with low stock
     */
    public void setLowStockAlertCount(int count) {
        lowStockAlerts.set(count);
    }

    /**
     * Update total stock.
     *
     * @param count Total stock count
     */
    public void setTotalStock(int count) {
        totalStock.set(count);
    }
}
