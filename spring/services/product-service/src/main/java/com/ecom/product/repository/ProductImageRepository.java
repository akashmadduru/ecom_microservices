package com.ecom.product.repository;

import com.ecom.product.model.ProductImage;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * ProductImageRepository: repository for ProductImage entities.
 */
public interface ProductImageRepository extends BaseRepository<ProductImage, Integer> {
    /**
     * Find all images for a product.
     */
    @Query("SELECT pi FROM ProductImage pi WHERE pi.productId = :productId ORDER BY pi.sortOrder ASC")
    List<ProductImage> findByProduct(@Param("productId") Integer productId);

    /**
     * Find images for a product variant.
     */
    @Query("SELECT pi FROM ProductImage pi WHERE pi.productId = :productId AND pi.variantId = :variantId ORDER BY pi.sortOrder ASC")
    List<ProductImage> findByProductAndVariant(@Param("productId") Integer productId, @Param("variantId") Integer variantId);

    /**
     * Find primary image for a product.
     */
    @Query("SELECT pi FROM ProductImage pi WHERE pi.productId = :productId AND pi.variantId IS NULL AND pi.kind = 'PRIMARY'")
    Optional<ProductImage> findPrimaryImage(@Param("productId") Integer productId);

    /**
     * Find primary image for a product variant.
     */
    @Query("SELECT pi FROM ProductImage pi WHERE pi.productId = :productId AND pi.variantId = :variantId AND pi.kind = 'PRIMARY'")
    Optional<ProductImage> findPrimaryImageForVariant(@Param("productId") Integer productId, @Param("variantId") Integer variantId);

    /**
     * Find all gallery images for a product.
     */
    @Query("SELECT pi FROM ProductImage pi WHERE pi.productId = :productId AND pi.kind = 'GALLERY' ORDER BY pi.sortOrder ASC")
    List<ProductImage> findGalleryImages(@Param("productId") Integer productId);
}
