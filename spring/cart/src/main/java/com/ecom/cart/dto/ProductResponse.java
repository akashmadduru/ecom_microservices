package com.ecom.cart.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.math.BigDecimal;

/**
 * Product response DTO from Products Service.
 * No Lombok - uses manual getters/setters for consistency with Phase 1 requirements.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class ProductResponse {

    private Long id;
    private String name;
    private String description;
    private BigDecimal price;
    private String sku;
    private Boolean active;

    public ProductResponse() {
    }

    public ProductResponse(Long id, String name, String description, BigDecimal price, String sku, Boolean active) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.price = price;
        this.sku = sku;
        this.active = active;
    }

    public static ProductResponseBuilder builder() {
        return new ProductResponseBuilder();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public void setPrice(BigDecimal price) {
        this.price = price;
    }

    public String getSku() {
        return sku;
    }

    public void setSku(String sku) {
        this.sku = sku;
    }

    public Boolean getActive() {
        return active;
    }

    public void setActive(Boolean active) {
        this.active = active;
    }

    public static class ProductResponseBuilder {
        private Long id;
        private String name;
        private String description;
        private BigDecimal price;
        private String sku;
        private Boolean active;

        public ProductResponseBuilder id(Long id) {
            this.id = id;
            return this;
        }

        public ProductResponseBuilder name(String name) {
            this.name = name;
            return this;
        }

        public ProductResponseBuilder description(String description) {
            this.description = description;
            return this;
        }

        public ProductResponseBuilder price(BigDecimal price) {
            this.price = price;
            return this;
        }

        public ProductResponseBuilder sku(String sku) {
            this.sku = sku;
            return this;
        }

        public ProductResponseBuilder active(Boolean active) {
            this.active = active;
            return this;
        }

        public ProductResponse build() {
            return new ProductResponse(id, name, description, price, sku, active);
        }
    }
}
