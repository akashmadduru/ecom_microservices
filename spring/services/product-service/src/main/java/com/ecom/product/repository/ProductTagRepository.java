package com.ecom.product.repository;

import com.ecom.product.model.ProductTag;
import com.ecom.product.model.ProductTagId;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/**
 * ProductTagRepository: repository for ProductTag junction entities.
 */
public interface ProductTagRepository extends BaseRepository<ProductTag, ProductTagId> {
    /**
     * Find all tag IDs for a product.
     */
    @Query("SELECT pt.tagId FROM ProductTag pt WHERE pt.productId = :productId")
    List<Integer> findTagIdsByProduct(@Param("productId") Integer productId);

    /**
     * Find all product IDs with a specific tag.
     */
    @Query("SELECT pt.productId FROM ProductTag pt WHERE pt.tagId = :tagId")
    List<Integer> findProductIdsByTag(@Param("tagId") Integer tagId);

    /**
     * Delete all tags for a product.
     */
    void deleteByProductId(Integer productId);

    /**
     * Count tags for a product.
     */
    long countByProductId(Integer productId);
}
