package com.ecom.product.repository;

import com.ecom.product.model.ProductVariant;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * ProductVariantRepository: repository for ProductVariant entities.
 */
public interface ProductVariantRepository extends BaseRepository<ProductVariant, Integer> {
    /**
     * Find all variants for a product.
     */
    @Query("SELECT pv FROM ProductVariant pv WHERE pv.productId = :productId ORDER BY pv.isDefault DESC, pv.variantName ASC")
    List<ProductVariant> findByProduct(@Param("productId") Integer productId);

    /**
     * Find default variant for a product.
     */
    @Query("SELECT pv FROM ProductVariant pv WHERE pv.productId = :productId AND pv.isDefault = TRUE")
    Optional<ProductVariant> findDefaultVariant(@Param("productId") Integer productId);

    /**
     * Find variant by barcode (partial unique index allows NULL).
     */
    Optional<ProductVariant> findByBarcode(String barcode);

    /**
     * Find variant by UPC.
     */
    Optional<ProductVariant> findByUpc(String upc);

    /**
     * Find variant by EAN.
     */
    Optional<ProductVariant> findByEan(String ean);

    /**
     * Find active variants only.
     */
    @Query("SELECT pv FROM ProductVariant pv WHERE pv.productId = :productId AND pv.status = 'ACTIVE'")
    List<ProductVariant> findActiveVariants(@Param("productId") Integer productId);

    /**
     * Count variants for a product.
     */
    @Query("SELECT COUNT(pv) FROM ProductVariant pv WHERE pv.productId = :productId")
    long countByProduct(@Param("productId") Integer productId);
}
