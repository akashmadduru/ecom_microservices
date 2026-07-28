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
@Table(indexes = {
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
public class Products {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(unique = true, length = 64, columnDefinition = "text")
    private String uniqId;

    @Column(nullable = false, columnDefinition = "text")
    private String title;

    @Column(nullable = false, unique = true, length = 320)
    private String slug;

    @Column(columnDefinition = "text")
    private String productUrl;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal retailPrice = BigDecimal.ZERO;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal discount = BigDecimal.ZERO;

    @Column(columnDefinition = "text")
    private String imageUrls;

    @Column(columnDefinition = "text")
    private String description;

    // Legacy columns (maintained for backward compatibility)
    @Column(columnDefinition = "text")
    private String category;

    @Column(columnDefinition = "text")
    private String subCategory;

    @Column(columnDefinition = "text")
    private String brand;

    @Column(nullable = false, precision = 3, scale = 2)
    private BigDecimal rating = BigDecimal.ZERO;

    @Column(nullable = false)
    private Integer reviewCount = 0;

    @Column(length = 64)
    private String sellerId;

    // Foreign keys to taxonomy
    @Column()
    private Integer brandId;

    @Column()
    private Integer manufacturerId;

    @Column()
    private Integer categoryId;

    // Product status and lifecycle
    @Column(nullable = false, length = 20, columnDefinition = "text")
    private String status = "DRAFT";

    // SEO metadata
    @Column(length = 255)
    private String seoTitle;

    @Column(length = 500)
    private String seoDescription;

    @Column(columnDefinition = "text")
    private String canonicalUrl;

    @Column(columnDefinition = "text[]")
    private String[] metaKeywords;

    // Spec attributes as JSONB
    @Column(columnDefinition = "jsonb", nullable = false)
    private String attributes = "{}";

    // Computed full-text search column (PostgreSQL TSVECTOR)
    // This is maintained automatically by a trigger in the database.
    @Column(columnDefinition = "tsvector")
    private String searchDocument;

    // Audit and soft-delete
    @Column(length = 64)
    private String createdBy;

    @Column(length = 64)
    private String updatedBy;

    @Column(nullable = false)
    private Boolean isDeleted = false;

    @Column()
    private LocalDateTime deletedAt;

    @Column(length = 64)
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

    public Products() {}

    public Products(String title, String slug) {
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

    public static ProductsBuilder builder() {
        return new ProductsBuilder();
    }

    public static class ProductsBuilder {
        private Integer id;
        private String uniqId;
        private String title;
        private String slug;
        private String productUrl;
        private BigDecimal retailPrice;
        private BigDecimal discount;
        private String imageUrls;
        private String description;
        private String category;
        private String subCategory;
        private String brand;
        private BigDecimal rating;
        private Integer reviewCount;
        private String sellerId;
        private Integer brandId;
        private Integer manufacturerId;
        private Integer categoryId;
        private String status;
        private String seoTitle;
        private String seoDescription;
        private String canonicalUrl;
        private String[] metaKeywords;
        private String attributes;
        private String searchDocument;
        private String createdBy;
        private String updatedBy;
        private Boolean isDeleted;
        private LocalDateTime deletedAt;
        private String deletedBy;
        private Integer version;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
        private List<ProductVariant> variants;
        private List<ProductImage> images;

        public ProductsBuilder id(Integer id) { this.id = id; return this; }
        public ProductsBuilder uniqId(String uniqId) { this.uniqId = uniqId; return this; }
        public ProductsBuilder title(String title) { this.title = title; return this; }
        public ProductsBuilder slug(String slug) { this.slug = slug; return this; }
        public ProductsBuilder productUrl(String productUrl) { this.productUrl = productUrl; return this; }
        public ProductsBuilder retailPrice(BigDecimal retailPrice) { this.retailPrice = retailPrice; return this; }
        public ProductsBuilder discount(BigDecimal discount) { this.discount = discount; return this; }
        public ProductsBuilder imageUrls(String imageUrls) { this.imageUrls = imageUrls; return this; }
        public ProductsBuilder description(String description) { this.description = description; return this; }
        public ProductsBuilder category(String category) { this.category = category; return this; }
        public ProductsBuilder subCategory(String subCategory) { this.subCategory = subCategory; return this; }
        public ProductsBuilder brand(String brand) { this.brand = brand; return this; }
        public ProductsBuilder rating(BigDecimal rating) { this.rating = rating; return this; }
        public ProductsBuilder reviewCount(Integer reviewCount) { this.reviewCount = reviewCount; return this; }
        public ProductsBuilder sellerId(String sellerId) { this.sellerId = sellerId; return this; }
        public ProductsBuilder brandId(Integer brandId) { this.brandId = brandId; return this; }
        public ProductsBuilder manufacturerId(Integer manufacturerId) { this.manufacturerId = manufacturerId; return this; }
        public ProductsBuilder categoryId(Integer categoryId) { this.categoryId = categoryId; return this; }
        public ProductsBuilder status(String status) { this.status = status; return this; }
        public ProductsBuilder seoTitle(String seoTitle) { this.seoTitle = seoTitle; return this; }
        public ProductsBuilder seoDescription(String seoDescription) { this.seoDescription = seoDescription; return this; }
        public ProductsBuilder canonicalUrl(String canonicalUrl) { this.canonicalUrl = canonicalUrl; return this; }
        public ProductsBuilder metaKeywords(String[] metaKeywords) { this.metaKeywords = metaKeywords; return this; }
        public ProductsBuilder attributes(String attributes) { this.attributes = attributes; return this; }
        public ProductsBuilder searchDocument(String searchDocument) { this.searchDocument = searchDocument; return this; }
        public ProductsBuilder createdBy(String createdBy) { this.createdBy = createdBy; return this; }
        public ProductsBuilder updatedBy(String updatedBy) { this.updatedBy = updatedBy; return this; }
        public ProductsBuilder isDeleted(Boolean isDeleted) { this.isDeleted = isDeleted; return this; }
        public ProductsBuilder deletedAt(LocalDateTime deletedAt) { this.deletedAt = deletedAt; return this; }
        public ProductsBuilder deletedBy(String deletedBy) { this.deletedBy = deletedBy; return this; }
        public ProductsBuilder version(Integer version) { this.version = version; return this; }
        public ProductsBuilder createdAt(LocalDateTime createdAt) { this.createdAt = createdAt; return this; }
        public ProductsBuilder updatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; return this; }
        public ProductsBuilder variants(List<ProductVariant> variants) { this.variants = variants; return this; }
        public ProductsBuilder images(List<ProductImage> images) { this.images = images; return this; }

        public Products build() {
            Products products = new Products();
            products.id = this.id;
            products.uniqId = this.uniqId;
            products.title = this.title;
            products.slug = this.slug;
            products.productUrl = this.productUrl;
            products.retailPrice = this.retailPrice;
            products.discount = this.discount;
            products.imageUrls = this.imageUrls;
            products.description = this.description;
            products.category = this.category;
            products.subCategory = this.subCategory;
            products.brand = this.brand;
            products.rating = this.rating;
            products.reviewCount = this.reviewCount;
            products.sellerId = this.sellerId;
            products.brandId = this.brandId;
            products.manufacturerId = this.manufacturerId;
            products.categoryId = this.categoryId;
            products.status = this.status;
            products.seoTitle = this.seoTitle;
            products.seoDescription = this.seoDescription;
            products.canonicalUrl = this.canonicalUrl;
            products.metaKeywords = this.metaKeywords;
            products.attributes = this.attributes;
            products.searchDocument = this.searchDocument;
            products.createdBy = this.createdBy;
            products.updatedBy = this.updatedBy;
            products.isDeleted = this.isDeleted;
            products.deletedAt = this.deletedAt;
            products.deletedBy = this.deletedBy;
            products.version = this.version;
            products.createdAt = this.createdAt;
            products.updatedAt = this.updatedAt;
            products.variants = this.variants;
            products.images = this.images;
            return products;
        }
    }
}
