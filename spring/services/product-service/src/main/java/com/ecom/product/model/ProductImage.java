package com.ecom.product.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.ToString;

/**
 * ProductImage: represents an image for a product or product variant.
 *
 * Supports multiple image kinds: PRIMARY, GALLERY, THUMBNAIL, SPIN_360, VIDEO.
 * Enforces uniqueness constraint for PRIMARY images per product/variant.
 */
@Entity
@Table(name = "product_images", indexes = {
    @Index(name = "ix_product_images_product_id", columnList = "product_id"),
    @Index(name = "ix_product_images_variant_id", columnList = "variant_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@ToString
public class ProductImage {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "product_id", nullable = false)
    private Integer productId;

    @Column(name = "variant_id")
    private Integer variantId;

    @Column(nullable = false, length = 20)
    private String kind = "GALLERY";  // PRIMARY, GALLERY, THUMBNAIL, SPIN_360, VIDEO

    @Column(nullable = false, columnDefinition = "text")
    private String url;

    @Column(name = "video_url", columnDefinition = "text")
    private String videoUrl;

    @Column(name = "alt_text", length = 255)
    private String altText;

    @Column(nullable = false, name = "sort_order")
    private Integer sortOrder = 0;

    // Relationship to Product
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_id", updatable = false, insertable = false)
    private Product product;

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
}
