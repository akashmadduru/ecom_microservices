package com.ecom.product.model;

import lombok.AllArgsConstructor;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.io.Serializable;

/**
 * ProductVariantAttributeValueId: composite primary key for ProductVariantAttributeValue junction table.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode
public class ProductVariantAttributeValueId implements Serializable {
    private Integer variantId;
    private Integer attributeValueId;
}
