package com.ecom.product.model;

import jakarta.persistence.*;

/**
 * ProductAttribute: defines an attribute type that can be used to create variants.
 * Examples: Size, Color, Material.
 */
@Entity
@Table(name = "product_attributes", indexes = {
    @Index(name = "idx_attribute_code", columnList = "code")
})
public class ProductAttribute {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(nullable = false, unique = true, length = 100)
    private String name;

    @Column(nullable = false, unique = true, length = 100)
    private String code;

    @Column(nullable = false, name = "is_variant_defining")
    private Boolean isVariantDefining = false;

    @Column(nullable = false, name = "sort_order")
    private Integer sortOrder = 0;

    public ProductAttribute() {
    }

    public ProductAttribute(String name, String code) {
        this.name = name;
        this.code = code;
        this.isVariantDefining = false;
    }

    public ProductAttribute(Integer id, String name, String code, Boolean isVariantDefining, Integer sortOrder) {
        this.id = id;
        this.name = name;
        this.code = code;
        this.isVariantDefining = isVariantDefining;
        this.sortOrder = sortOrder;
    }

    public Integer getId() {
        return this.id;
    }

    public void setId(Integer id) {
        this.id = id;
    }

    public String getName() {
        return this.name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getCode() {
        return this.code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public Boolean getIsVariantDefining() {
        return this.isVariantDefining;
    }

    public void setIsVariantDefining(Boolean isVariantDefining) {
        this.isVariantDefining = isVariantDefining;
    }

    public Integer getSortOrder() {
        return this.sortOrder;
    }

    public void setSortOrder(Integer sortOrder) {
        this.sortOrder = sortOrder;
    }

    @Override
    public String toString() {
        return "ProductAttribute{" +
                "id=" + id +
                ", name='" + name + '\'' +
                ", code='" + code + '\'' +
                ", isVariantDefining=" + isVariantDefining +
                ", sortOrder=" + sortOrder +
                '}';
    }
}
