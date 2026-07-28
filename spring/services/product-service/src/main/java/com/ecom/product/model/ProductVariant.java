package com.ecom.product.model;

import jakarta.persistence.*;
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
@Table(indexes = {
    @Index(name = "ix_product_variants_product_id", columnList = "product_id"),
    @Index(name = "idx_product_variants_hsn", columnList = "hsn_code")
})
@DynamicInsert
@DynamicUpdate
public class ProductVariant {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(nullable = false)
    private Integer productId;

    @Column(nullable = false, length = 200)
    private String variantName;  // e.g., "Red / XL"

    @Column(length = 64)
    private String barcode;

    @Column(length = 64)
    private String upc;

    @Column(length = 64)
    private String ean;

    @Column(length = 16)
    private String hsnCode;

    @Column(length = 40)
    private String gstCategory;

    @Column(length = 2)
    private String countryOfOrigin;

    // Physical dimensions and shipping
    @Column()
    private Integer weightGrams;

    @Column()
    private Integer lengthMm;

    @Column()
    private Integer widthMm;

    @Column()
    private Integer heightMm;

    @Column(nullable = false)
    private Boolean fragile = false;

    @Column(length = 40)
    private String shippingClass;

    // Warranty and expiry tracking
    @Column()
    private Integer manufacturerWarrantyMonths;

    @Column(nullable = false)
    private Boolean serialNumberRequired = false;

    @Column(nullable = false)
    private Boolean expiryTracked = false;

    // Attributes and status
    @Column(columnDefinition = "jsonb", nullable = false)
    private String attributes = "{}";

    @Column(nullable = false)
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
    @JoinColumn(updatable = false, insertable = false)
    private Products products;

    public ProductVariant() {
    }

    public ProductVariant(Integer productId, String variantName) {
        this.productId = productId;
        this.variantName = variantName;
        this.status = "ACTIVE";
    }

    public Integer getId() {
        return this.id;
    }

    public void setId(Integer id) {
        this.id = id;
    }

    public Integer getProductId() {
        return this.productId;
    }

    public void setProductId(Integer productId) {
        this.productId = productId;
    }

    public String getVariantName() {
        return this.variantName;
    }

    public void setVariantName(String variantName) {
        this.variantName = variantName;
    }

    public String getBarcode() {
        return this.barcode;
    }

    public void setBarcode(String barcode) {
        this.barcode = barcode;
    }

    public String getUpc() {
        return this.upc;
    }

    public void setUpc(String upc) {
        this.upc = upc;
    }

    public String getEan() {
        return this.ean;
    }

    public void setEan(String ean) {
        this.ean = ean;
    }

    public String getHsnCode() {
        return this.hsnCode;
    }

    public void setHsnCode(String hsnCode) {
        this.hsnCode = hsnCode;
    }

    public String getGstCategory() {
        return this.gstCategory;
    }

    public void setGstCategory(String gstCategory) {
        this.gstCategory = gstCategory;
    }

    public String getCountryOfOrigin() {
        return this.countryOfOrigin;
    }

    public void setCountryOfOrigin(String countryOfOrigin) {
        this.countryOfOrigin = countryOfOrigin;
    }

    public Integer getWeightGrams() {
        return this.weightGrams;
    }

    public void setWeightGrams(Integer weightGrams) {
        this.weightGrams = weightGrams;
    }

    public Integer getLengthMm() {
        return this.lengthMm;
    }

    public void setLengthMm(Integer lengthMm) {
        this.lengthMm = lengthMm;
    }

    public Integer getWidthMm() {
        return this.widthMm;
    }

    public void setWidthMm(Integer widthMm) {
        this.widthMm = widthMm;
    }

    public Integer getHeightMm() {
        return this.heightMm;
    }

    public void setHeightMm(Integer heightMm) {
        this.heightMm = heightMm;
    }

    public Boolean getFragile() {
        return this.fragile;
    }

    public void setFragile(Boolean fragile) {
        this.fragile = fragile;
    }

    public String getShippingClass() {
        return this.shippingClass;
    }

    public void setShippingClass(String shippingClass) {
        this.shippingClass = shippingClass;
    }

    public Integer getManufacturerWarrantyMonths() {
        return this.manufacturerWarrantyMonths;
    }

    public void setManufacturerWarrantyMonths(Integer manufacturerWarrantyMonths) {
        this.manufacturerWarrantyMonths = manufacturerWarrantyMonths;
    }

    public Boolean getSerialNumberRequired() {
        return this.serialNumberRequired;
    }

    public void setSerialNumberRequired(Boolean serialNumberRequired) {
        this.serialNumberRequired = serialNumberRequired;
    }

    public Boolean getExpiryTracked() {
        return this.expiryTracked;
    }

    public void setExpiryTracked(Boolean expiryTracked) {
        this.expiryTracked = expiryTracked;
    }

    public String getAttributes() {
        return this.attributes;
    }

    public void setAttributes(String attributes) {
        this.attributes = attributes;
    }

    public Boolean getIsDefault() {
        return this.isDefault;
    }

    public void setIsDefault(Boolean isDefault) {
        this.isDefault = isDefault;
    }

    public String getStatus() {
        return this.status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public LocalDateTime getCreatedAt() {
        return this.createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return this.updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }

    public Products getProduct() {
        return this.products;
    }

    public void setProduct(Products products) {
        this.products = products;
    }

    @Override
    public String toString() {
        return "ProductVariant{" +
                "id=" + id +
                ", productId=" + productId +
                ", variantName='" + variantName + '\'' +
                ", barcode='" + barcode + '\'' +
                ", upc='" + upc + '\'' +
                ", ean='" + ean + '\'' +
                ", hsnCode='" + hsnCode + '\'' +
                ", gstCategory='" + gstCategory + '\'' +
                ", countryOfOrigin='" + countryOfOrigin + '\'' +
                ", weightGrams=" + weightGrams +
                ", lengthMm=" + lengthMm +
                ", widthMm=" + widthMm +
                ", heightMm=" + heightMm +
                ", fragile=" + fragile +
                ", shippingClass='" + shippingClass + '\'' +
                ", manufacturerWarrantyMonths=" + manufacturerWarrantyMonths +
                ", serialNumberRequired=" + serialNumberRequired +
                ", expiryTracked=" + expiryTracked +
                ", attributes='" + attributes + '\'' +
                ", isDefault=" + isDefault +
                ", status='" + status + '\'' +
                ", createdAt=" + createdAt +
                ", updatedAt=" + updatedAt +
                '}';
    }
}
