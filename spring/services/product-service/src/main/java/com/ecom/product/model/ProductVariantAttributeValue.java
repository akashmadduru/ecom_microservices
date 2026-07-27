package com.ecom.product.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.ToString;

/**
 * ProductVariantAttributeValue: junction table for ProductVariant-AttributeValue many-to-many relationship.
 *
 * Represents the specific attribute values that define a variant.
 * Example: if variant is "Red / XL", this table contains the links to
 * AttributeValue records for "Red" (Color attribute) and "XL" (Size attribute).
 */
@Entity
@Table(name = "product_variant_attribute_values")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@ToString
@IdClass(ProductVariantAttributeValueId.class)
public class ProductVariantAttributeValue {
    @Id
    @Column(name = "variant_id")
    private Integer variantId;

    @Id
    @Column(name = "attribute_value_id")
    private Integer attributeValueId;
}
