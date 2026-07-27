package com.ecom.product.model;

import java.io.Serializable;
import java.util.Objects;

/**
 * ProductVariantAttributeValueId: composite primary key for ProductVariantAttributeValue junction table.
 */
public class ProductVariantAttributeValueId implements Serializable {
    private Integer variantId;
    private Integer attributeValueId;

    public ProductVariantAttributeValueId() {
    }

    public ProductVariantAttributeValueId(Integer variantId, Integer attributeValueId) {
        this.variantId = variantId;
        this.attributeValueId = attributeValueId;
    }

    public Integer getVariantId() {
        return this.variantId;
    }

    public void setVariantId(Integer variantId) {
        this.variantId = variantId;
    }

    public Integer getAttributeValueId() {
        return this.attributeValueId;
    }

    public void setAttributeValueId(Integer attributeValueId) {
        this.attributeValueId = attributeValueId;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        ProductVariantAttributeValueId that = (ProductVariantAttributeValueId) o;
        return Objects.equals(variantId, that.variantId) &&
               Objects.equals(attributeValueId, that.attributeValueId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(variantId, attributeValueId);
    }
}
