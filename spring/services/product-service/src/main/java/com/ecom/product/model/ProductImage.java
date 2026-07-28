package com.ecom.product.model;

import jakarta.persistence.*;

/**
 * ProductImage: represents an image for a product or product variant.
 *
 * Supports multiple image kinds: PRIMARY, GALLERY, THUMBNAIL, SPIN_360, VIDEO.
 * Enforces uniqueness constraint for PRIMARY images per product/variant.
 */
@Entity
@Table(indexes = {
    @Index(name = "ix_product_images_product_id", columnList = "product_id"),
    @Index(name = "ix_product_images_variant_id", columnList = "variant_id")
})
public class ProductImage {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(nullable = false)
    private Integer productId;

    @Column()
    private Integer variantId;

    @Column(nullable = false, length = 20)
    private String kind = "GALLERY";  // PRIMARY, GALLERY, THUMBNAIL, SPIN_360, VIDEO

    @Column(nullable = false, columnDefinition = "text")
    private String url;

    @Column(columnDefinition = "text")
    private String videoUrl;

    @Column(length = 255)
    private String altText;

    @Column(nullable = false)
    private Integer sortOrder = 0;

    // Relationship to Product
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(updatable = false, insertable = false)
    private Products products;

    public ProductImage() {
    }

    public ProductImage(Integer productId, String url) {
        this.productId = productId;
        this.url = url;
        this.kind = "GALLERY";
    }

    public ProductImage(Integer productId, Integer variantId, String kind, String url) {
        this.productId = productId;
        this.variantId = variantId;
        this.kind = kind;
        this.url = url;
    }

    public ProductImage(Integer id, Integer productId, Integer variantId, String kind, String url, String videoUrl, String altText, Integer sortOrder, Products products) {
        this.id = id;
        this.productId = productId;
        this.variantId = variantId;
        this.kind = kind;
        this.url = url;
        this.videoUrl = videoUrl;
        this.altText = altText;
        this.sortOrder = sortOrder;
        this.products = products;
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

    public Integer getVariantId() {
        return this.variantId;
    }

    public void setVariantId(Integer variantId) {
        this.variantId = variantId;
    }

    public String getKind() {
        return this.kind;
    }

    public void setKind(String kind) {
        this.kind = kind;
    }

    public String getUrl() {
        return this.url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public String getVideoUrl() {
        return this.videoUrl;
    }

    public void setVideoUrl(String videoUrl) {
        this.videoUrl = videoUrl;
    }

    public String getAltText() {
        return this.altText;
    }

    public void setAltText(String altText) {
        this.altText = altText;
    }

    public Integer getSortOrder() {
        return this.sortOrder;
    }

    public void setSortOrder(Integer sortOrder) {
        this.sortOrder = sortOrder;
    }

    public Products getProduct() {
        return this.products;
    }

    public void setProduct(Products products) {
        this.products = products;
    }

    @Override
    public String toString() {
        return "ProductImage{" +
                "id=" + id +
                ", productId=" + productId +
                ", variantId=" + variantId +
                ", kind='" + kind + '\'' +
                ", url='" + url + '\'' +
                ", videoUrl='" + videoUrl + '\'' +
                ", altText='" + altText + '\'' +
                ", sortOrder=" + sortOrder +
                '}';
    }
}
