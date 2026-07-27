package com.ecom.product.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.ToString;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.DynamicInsert;
import org.hibernate.annotations.DynamicUpdate;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * ProductVariant: represents a specific variant of a product (e.g., size, color combination).
 *
 * Carries barcode/UPC/EAN identifiers, physical dimensions, shipping info,
 * warranty details, and JSONB attributes.
 */
@Entity
@Table(name = "product_variants", indexes = {
    @Index(name = "ix_product_variants_product_id", columnList = "product_id"),
    @Index(name = "idx_product_variants_hsn", columnList = "hsn_code")
})
@DynamicInsert
@DynamicUpdate
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@ToString(exclude = "product")
public class ProductVariant {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "product_id", nullable = false)
    private Integer productId;

    @Column(nullable = false, length = 200, name = "variant_name")
    private String variantName;  // e.g., "Red / XL"

    @Column(length = 64)
    private String barcode;

    @Column(length = 64)
    private String upc;

    @Column(length = 64)
    private String ean;

    @Column(name = "hsn_code", length = 16)
    private String hsnCode;

    @Column(name = "gst_category", length = 40)
    private String gstCategory;

    @Column(name = "country_of_origin", length = 2)
    private String countryOfOrigin;

    // Physical dimensions and shipping
    @Column(name = "weight_grams")
    private Integer weightGrams;

    @Column(name = "length_mm")
    private Integer lengthMm;

    @Column(name = "width_mm")
    private Integer widthMm;

    @Column(name = "height_mm")
    private Integer heightMm;

    @Column(nullable = false)
    private Boolean fragile = false;

    @Column(name = "shipping_class", length = 40)
    private String shippingClass;

    // Warranty and expiry tracking
    @Column(name = "manufacturer_warranty_months")
    private Integer manufacturerWarrantyMonths;

    @Column(nullable = false, name = "serial_number_required")
    private Boolean serialNumberRequired = false;

    @Column(nullable = false, name = "expiry_tracked")
    private Boolean expiryTracked = false;

    // Attributes and status
    @Column(columnDefinition = "jsonb", nullable = false)
    private String attributes = "{}";

    @Column(nullable = false, name = "is_default")
    private Boolean isDefault = false;

    @Column(nullable = false, length = 20)
    private String status = "ACTIVE";

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(nullable = false)
    private LocalDateTime updatedAt;

    // Relationship to Product
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_id", updatable = false, insertable = false)
    private Product product;

    public ProductVariant(Integer productId, String variantName) {
        this.productId = productId;
        this.variantName = variantName;
        this.status = "ACTIVE";
    }
}
