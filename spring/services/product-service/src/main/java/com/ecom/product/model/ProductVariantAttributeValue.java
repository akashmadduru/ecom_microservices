package com.ecom.product.model;

import jakarta.persistence.*;

/**
 * ProductVariantAttributeValue: junction table for ProductVariant-AttributeValue many-to-many relationship.
 *
 * Represents the specific attribute values that define a variant.
 * Example: if variant is "Red / XL", this table contains the links to
 * AttributeValue records for "Red" (Color attribute) and "XL" (Size attribute).
 */
@Entity
@Table()
@IdClass(ProductVariantAttributeValueId.class)
public class ProductVariantAttributeValue {
    @Id
    @Column()
    private Integer variantId;

    @Id
    @Column()
    private Integer attributeValueId;

    public ProductVariantAttributeValue() {
    }

    public ProductVariantAttributeValue(Integer variantId, Integer attributeValueId) {
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
    public String toString() {
        return "ProductVariantAttributeValue{" +
                "variantId=" + variantId +
                ", attributeValueId=" + attributeValueId +
                '}';
    }
}
