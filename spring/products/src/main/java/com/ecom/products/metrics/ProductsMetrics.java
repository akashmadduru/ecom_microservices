package com.ecom.products.metrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicInteger;

/**
 * Custom business metrics for the Products Service.
 * Tracks: total products, products sold, search queries.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ProductsMetrics {

    private final MeterRegistry meterRegistry;

    // Gauges for current state
    private final AtomicInteger totalProductCount = new AtomicInteger(0);
    private final AtomicInteger activeCatalogSize = new AtomicInteger(0);

    /**
     * Record when a product is viewed.
     *
     * @param productId Product that was viewed
     * @param category Product category
     */
    public void recordProductViewed(String productId, String category) {
        Counter.builder("products.viewed")
            .tag("product_id", productId)
            .tag("category", category)
            .description("Total product views")
            .register(meterRegistry)
            .increment();

        log.debug("Recorded product view: product={}, category={}", productId, category);
    }

    /**
     * Record when a product is searched.
     *
     * @param searchQuery Search query used
     * @param resultCount Number of results found
     */
    public void recordProductSearch(String searchQuery, int resultCount) {
        Counter.builder("products.search")
            .tag("query", truncateTag(searchQuery))
            .tag("results", String.valueOf(resultCount > 0 ? "found" : "not_found"))
            .description("Total product searches")
            .register(meterRegistry)
            .increment();

        log.debug("Recorded search: query='{}', results={}", searchQuery, resultCount);
    }

    /**
     * Record product added to catalog.
     *
     * @param productId Product ID
     * @param category Product category
     * @param price Product price
     */
    public void recordProductAdded(String productId, String category, double price) {
        Counter.builder("products.added")
            .tag("product_id", productId)
            .tag("category", category)
            .tag("price_range", getPriceRange(price))
            .description("Total products added")
            .register(meterRegistry)
            .increment();

        activeCatalogSize.incrementAndGet();
        log.debug("Recorded product added: product={}, category={}, price={}", productId, category, price);
    }

    /**
     * Record product removed from catalog.
     *
     * @param productId Product ID
     * @param category Product category
     */
    public void recordProductRemoved(String productId, String category) {
        Counter.builder("products.removed")
            .tag("product_id", productId)
            .tag("category", category)
            .description("Total products removed")
            .register(meterRegistry)
            .increment();

        activeCatalogSize.decrementAndGet();
        log.debug("Recorded product removed: product={}, category={}", productId, category);
    }

    /**
     * Record product details retrieved/fetched.
     *
     * @param productId Product ID
     * @param status Fetch status (success, not_found)
     */
    public void recordProductFetch(String productId, String status) {
        Counter.builder("products.fetched")
            .tag("product_id", productId)
            .tag("status", status)
            .description("Total product fetch operations")
            .register(meterRegistry)
            .increment();

        log.debug("Recorded product fetch: product={}, status={}", productId, status);
    }

    /**
     * Register gauge for total product count.
     * Should be called at startup.
     */
    public void registerTotalProductCountGauge() {
        Gauge.builder("products.catalog.total", totalProductCount, AtomicInteger::get)
            .description("Total products in catalog")
            .register(meterRegistry);
    }

    /**
     * Register gauge for active catalog size.
     * Should be called at startup.
     */
    public void registerActiveCatalogSizeGauge() {
        Gauge.builder("products.catalog.active", activeCatalogSize, AtomicInteger::get)
            .description("Number of active products in catalog")
            .register(meterRegistry);
    }

    /**
     * Update total product count.
     *
     * @param count Total count
     */
    public void setTotalProductCount(int count) {
        totalProductCount.set(count);
    }

    /**
     * Update active catalog size.
     *
     * @param count Active product count
     */
    public void setActiveCatalogSize(int count) {
        activeCatalogSize.set(count);
    }

    /**
     * Helper: categorize price into ranges for metrics.
     *
     * @param price Product price
     * @return Price range label
     */
    private String getPriceRange(double price) {
        if (price < 50) return "0-50";
        if (price < 100) return "50-100";
        if (price < 500) return "100-500";
        if (price < 1000) return "500-1000";
        return "1000+";
    }

    /**
     * Helper: truncate tag value to reasonable length.
     *
     * @param value Tag value
     * @return Truncated value (max 50 chars)
     */
    private String truncateTag(String value) {
        return value.length() > 50 ? value.substring(0, 50) : value;
    }
}
