package com.ecom.product.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.ToString;

/**
 * ProductAttribute: defines an attribute type that can be used to create variants.
 * Examples: Size, Color, Material.
 */
@Entity
@Table(name = "product_attributes", indexes = {
    @Index(name = "idx_attribute_code", columnList = "code")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@ToString
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

    public ProductAttribute(String name, String code) {
        this.name = name;
        this.code = code;
        this.isVariantDefining = false;
    }
}
