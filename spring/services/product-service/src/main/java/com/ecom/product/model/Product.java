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
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@ToString(exclude = {"variants", "images"})
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

    public Product(String title, String slug) {
        this.title = title;
        this.slug = slug;
        this.status = "DRAFT";
        this.isDeleted = false;
    }
}
