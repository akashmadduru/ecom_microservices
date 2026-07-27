package com.ecom.product.model;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.DynamicInsert;
import org.hibernate.annotations.DynamicUpdate;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Product: core catalog product entity.
 *
 * Includes soft-delete (is_deleted, deleted_at, deleted_by), audit fields (created_by, updated_by),
 * version tracking, SEO metadata, and a computed TSVECTOR search_document column.
 * Carries relationships to variants and images.
 */
@Entity
@Table(name = "products", indexes = {
    @Index(name = "ix_products_uniq_id", columnList = "uniq_id"),
    @Index(name = "ix_products_slug", columnList = "slug"),
    @Index(name = "ix_products_seller_id", columnList = "seller_id"),
    @Index(name = "ix_products_brand_id", columnList = "brand_id"),
    @Index(name = "ix_products_category_id", columnList = "category_id"),
    @Index(name = "ix_products_status", columnList = "status"),
    @Index(name = "ix_products_is_deleted", columnList = "is_deleted"),
    @Index(name = "ix_products_published_category", columnList = "category_id", unique = false)
})
@DynamicInsert
@DynamicUpdate
public class Product {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "uniq_id", unique = true, length = 64, columnDefinition = "text")
    private String uniqId;

    @Column(nullable = false, columnDefinition = "text")
    private String title;

    @Column(nullable = false, unique = true, length = 320)
    private String slug;

    @Column(name = "product_url", columnDefinition = "text")
    private String productUrl;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal retailPrice = BigDecimal.ZERO;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal discount = BigDecimal.ZERO;

    @Column(name = "image_urls", columnDefinition = "text")
    private String imageUrls;

    @Column(columnDefinition = "text")
    private String description;

    // Legacy columns (maintained for backward compatibility)
    @Column(columnDefinition = "text")
    private String category;

    @Column(name = "sub_category", columnDefinition = "text")
    private String subCategory;

    @Column(columnDefinition = "text")
    private String brand;

    @Column(nullable = false, precision = 3, scale = 2)
    private BigDecimal rating = BigDecimal.ZERO;

    @Column(nullable = false, name = "review_count")
    private Integer reviewCount = 0;

    @Column(name = "seller_id", length = 64)
    private String sellerId;

    // Foreign keys to taxonomy
    @Column(name = "brand_id")
    private Integer brandId;

    @Column(name = "manufacturer_id")
    private Integer manufacturerId;

    @Column(name = "category_id")
    private Integer categoryId;

    // Product status and lifecycle
    @Column(nullable = false, length = 20, columnDefinition = "text")
    private String status = "DRAFT";

    // SEO metadata
    @Column(name = "seo_title", length = 255)
    private String seoTitle;

    @Column(name = "seo_description", length = 500)
    private String seoDescription;

    @Column(name = "canonical_url", columnDefinition = "text")
    private String canonicalUrl;

    @Column(name = "meta_keywords", columnDefinition = "text[]")
    private String[] metaKeywords;

    // Spec attributes as JSONB
    @Column(columnDefinition = "jsonb", nullable = false)
    private String attributes = "{}";

    // Computed full-text search column (PostgreSQL TSVECTOR)
    // This is maintained automatically by a trigger in the database.
    @Column(name = "search_document", columnDefinition = "tsvector")
    private String searchDocument;

    // Audit and soft-delete
    @Column(name = "created_by", length = 64)
    private String createdBy;

    @Column(name = "updated_by", length = 64)
    private String updatedBy;

    @Column(nullable = false, name = "is_deleted")
    private Boolean isDeleted = false;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @Column(name = "deleted_by", length = 64)
    private String deletedBy;

    @Column(nullable = false)
    private Integer version = 1;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(nullable = false)
    private LocalDateTime updatedAt;

    // Relationships
    @OneToMany(mappedBy = "product", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<ProductVariant> variants = new ArrayList<>();

    @OneToMany(mappedBy = "product", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<ProductImage> images = new ArrayList<>();

    public Product() {
    }

    public Product(String title, String slug) {
        this.title = title;
        this.slug = slug;
        this.status = "DRAFT";
        this.isDeleted = false;
    }

    public Integer getId() { return this.id; }
    public void setId(Integer id) { this.id = id; }
    public String getUniqId() { return this.uniqId; }
    public void setUniqId(String uniqId) { this.uniqId = uniqId; }
    public String getTitle() { return this.title; }
    public void setTitle(String title) { this.title = title; }
    public String getSlug() { return this.slug; }
    public void setSlug(String slug) { this.slug = slug; }
    public String getProductUrl() { return this.productUrl; }
    public void setProductUrl(String productUrl) { this.productUrl = productUrl; }
    public BigDecimal getRetailPrice() { return this.retailPrice; }
    public void setRetailPrice(BigDecimal retailPrice) { this.retailPrice = retailPrice; }
    public BigDecimal getDiscount() { return this.discount; }
    public void setDiscount(BigDecimal discount) { this.discount = discount; }
    public String getImageUrls() { return this.imageUrls; }
    public void setImageUrls(String imageUrls) { this.imageUrls = imageUrls; }
    public String getDescription() { return this.description; }
    public void setDescription(String description) { this.description = description; }
    public String getCategory() { return this.category; }
    public void setCategory(String category) { this.category = category; }
    public String getSubCategory() { return this.subCategory; }
    public void setSubCategory(String subCategory) { this.subCategory = subCategory; }
    public String getBrand() { return this.brand; }
    public void setBrand(String brand) { this.brand = brand; }
    public BigDecimal getRating() { return this.rating; }
    public void setRating(BigDecimal rating) { this.rating = rating; }
    public Integer getReviewCount() { return this.reviewCount; }
    public void setReviewCount(Integer reviewCount) { this.reviewCount = reviewCount; }
    public String getSellerId() { return this.sellerId; }
    public void setSellerId(String sellerId) { this.sellerId = sellerId; }
    public Integer getBrandId() { return this.brandId; }
    public void setBrandId(Integer brandId) { this.brandId = brandId; }
    public Integer getManufacturerId() { return this.manufacturerId; }
    public void setManufacturerId(Integer manufacturerId) { this.manufacturerId = manufacturerId; }
    public Integer getCategoryId() { return this.categoryId; }
    public void setCategoryId(Integer categoryId) { this.categoryId = categoryId; }
    public String getStatus() { return this.status; }
    public void setStatus(String status) { this.status = status; }
    public String getSeoTitle() { return this.seoTitle; }
    public void setSeoTitle(String seoTitle) { this.seoTitle = seoTitle; }
    public String getSeoDescription() { return this.seoDescription; }
    public void setSeoDescription(String seoDescription) { this.seoDescription = seoDescription; }
    public String getCanonicalUrl() { return this.canonicalUrl; }
    public void setCanonicalUrl(String canonicalUrl) { this.canonicalUrl = canonicalUrl; }
    public String[] getMetaKeywords() { return this.metaKeywords; }
    public void setMetaKeywords(String[] metaKeywords) { this.metaKeywords = metaKeywords; }
    public String getAttributes() { return this.attributes; }
    public void setAttributes(String attributes) { this.attributes = attributes; }
    public String getSearchDocument() { return this.searchDocument; }
    public void setSearchDocument(String searchDocument) { this.searchDocument = searchDocument; }
    public String getCreatedBy() { return this.createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    public String getUpdatedBy() { return this.updatedBy; }
    public void setUpdatedBy(String updatedBy) { this.updatedBy = updatedBy; }
    public Boolean getIsDeleted() { return this.isDeleted; }
    public void setIsDeleted(Boolean isDeleted) { this.isDeleted = isDeleted; }
    public LocalDateTime getDeletedAt() { return this.deletedAt; }
    public void setDeletedAt(LocalDateTime deletedAt) { this.deletedAt = deletedAt; }
    public String getDeletedBy() { return this.deletedBy; }
    public void setDeletedBy(String deletedBy) { this.deletedBy = deletedBy; }
    public Integer getVersion() { return this.version; }
    public void setVersion(Integer version) { this.version = version; }
    public LocalDateTime getCreatedAt() { return this.createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return this.updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
    public List<ProductVariant> getVariants() { return this.variants; }
    public void setVariants(List<ProductVariant> variants) { this.variants = variants; }
    public List<ProductImage> getImages() { return this.images; }
    public void setImages(List<ProductImage> images) { this.images = images; }

    @Override
    public String toString() {
        return "Product{" +
                "id=" + id +
                ", uniqId='" + uniqId + '\'' +
                ", title='" + title + '\'' +
                ", slug='" + slug + '\'' +
                ", productUrl='" + productUrl + '\'' +
                ", retailPrice=" + retailPrice +
                ", discount=" + discount +
                ", imageUrls='" + imageUrls + '\'' +
                ", description='" + description + '\'' +
                ", category='" + category + '\'' +
                ", subCategory='" + subCategory + '\'' +
                ", brand='" + brand + '\'' +
                ", rating=" + rating +
                ", reviewCount=" + reviewCount +
                ", sellerId='" + sellerId + '\'' +
                ", brandId=" + brandId +
                ", manufacturerId=" + manufacturerId +
                ", categoryId=" + categoryId +
                ", status='" + status + '\'' +
                ", seoTitle='" + seoTitle + '\'' +
                ", seoDescription='" + seoDescription + '\'' +
                ", canonicalUrl='" + canonicalUrl + '\'' +
                ", attributes='" + attributes + '\'' +
                ", searchDocument='" + searchDocument + '\'' +
                ", createdBy='" + createdBy + '\'' +
                ", updatedBy='" + updatedBy + '\'' +
                ", isDeleted=" + isDeleted +
                ", deletedAt=" + deletedAt +
                ", deletedBy='" + deletedBy + '\'' +
                ", version=" + version +
                ", createdAt=" + createdAt +
                ", updatedAt=" + updatedAt +
                '}';
    }
}
