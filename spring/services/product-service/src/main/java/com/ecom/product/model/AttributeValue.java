package com.ecom.product.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.ToString;

/**
 * AttributeValue: represents a specific value for an attribute.
 * Example: For ProductAttribute(code="size"), this entity represents values like "S", "M", "L", "XL".
 */
@Entity
@Table(name = "attribute_values",
uniqueConstraints = {
    @UniqueConstraint(name = "uq_attribute_values_attribute_value", columnNames = {"attribute_id", "value"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@ToString
public class AttributeValue {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "attribute_id", nullable = false)
    private Integer attributeId;

    @Column(nullable = false, length = 150)
    private String value;

    @Column(nullable = false, length = 160)
    private String slug;

    @Column(nullable = false, name = "sort_order")
    private Integer sortOrder = 0;

    public AttributeValue(Integer attributeId, String value, String slug) {
        this.attributeId = attributeId;
        this.value = value;
        this.slug = slug;
    }
}
