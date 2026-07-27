package com.ecom.product.model;

import jakarta.persistence.*;

/**
 * AttributeValue: represents a specific value for an attribute.
 * Example: For ProductAttribute(code="size"), this entity represents values like "S", "M", "L", "XL".
 */
@Entity
@Table(name = "attribute_values",
uniqueConstraints = {
    @UniqueConstraint(name = "uq_attribute_values_attribute_value", columnNames = {"attribute_id", "value"})
})
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

    public AttributeValue() {
    }

    public AttributeValue(Integer attributeId, String value, String slug) {
        this.attributeId = attributeId;
        this.value = value;
        this.slug = slug;
    }

    public AttributeValue(Integer id, Integer attributeId, String value, String slug, Integer sortOrder) {
        this.id = id;
        this.attributeId = attributeId;
        this.value = value;
        this.slug = slug;
        this.sortOrder = sortOrder;
    }

    public Integer getId() {
        return this.id;
    }

    public void setId(Integer id) {
        this.id = id;
    }

    public Integer getAttributeId() {
        return this.attributeId;
    }

    public void setAttributeId(Integer attributeId) {
        this.attributeId = attributeId;
    }

    public String getValue() {
        return this.value;
    }

    public void setValue(String value) {
        this.value = value;
    }

    public String getSlug() {
        return this.slug;
    }

    public void setSlug(String slug) {
        this.slug = slug;
    }

    public Integer getSortOrder() {
        return this.sortOrder;
    }

    public void setSortOrder(Integer sortOrder) {
        this.sortOrder = sortOrder;
    }

    @Override
    public String toString() {
        return "AttributeValue{" +
                "id=" + id +
                ", attributeId=" + attributeId +
                ", value='" + value + '\'' +
                ", slug='" + slug + '\'' +
                ", sortOrder=" + sortOrder +
                '}';
    }
}
