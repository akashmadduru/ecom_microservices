package com.ecom.product.repository;

import com.ecom.product.model.ProductVariantAttributeValue;
import com.ecom.product.model.ProductVariantAttributeValueId;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/**
 * ProductVariantAttributeValueRepository: repository for ProductVariantAttributeValue junction entities.
 *
 * Manages the many-to-many relationship between ProductVariant and AttributeValue.
 */
public interface ProductVariantAttributeValueRepository extends BaseRepository<ProductVariantAttributeValue, ProductVariantAttributeValueId> {
    /**
     * Find all attribute values for a variant.
     */
    @Query("SELECT pvav.attributeValueId FROM ProductVariantAttributeValue pvav WHERE pvav.variantId = :variantId")
    List<Integer> findAttributeValuesByVariant(@Param("variantId") Integer variantId);

    /**
     * Find all variants with a specific attribute value.
     */
    @Query("SELECT pvav.variantId FROM ProductVariantAttributeValue pvav WHERE pvav.attributeValueId = :attributeValueId")
    List<Integer> findVariantsByAttributeValue(@Param("attributeValueId") Integer attributeValueId);

    /**
     * Delete all attribute values for a variant.
     */
    void deleteByVariantId(Integer variantId);

    /**
     * Count attribute values for a variant.
     */
    long countByVariantId(Integer variantId);
}
