package com.ecom.product.repository;

import com.ecom.product.model.CollectionProduct;
import com.ecom.product.model.CollectionProductId;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/**
 * CollectionProductRepository: repository for CollectionProduct junction entities.
 */
public interface CollectionProductRepository extends BaseRepository<CollectionProduct, CollectionProductId> {
    /**
     * Find all products in a collection.
     */
    @Query("SELECT cp.productId FROM CollectionProduct cp WHERE cp.collectionId = :collectionId ORDER BY cp.sortOrder ASC")
    List<Integer> findProductsByCollection(@Param("collectionId") Integer collectionId);

    /**
     * Find all collections containing a product.
     */
    @Query("SELECT cp.collectionId FROM CollectionProduct cp WHERE cp.productId = :productId")
    List<Integer> findCollectionsByProduct(@Param("productId") Integer productId);

    /**
     * Delete all products from a collection.
     */
    void deleteByCollectionId(Integer collectionId);

    /**
     * Delete product from all collections.
     */
    void deleteByProductId(Integer productId);

    /**
     * Count products in a collection.
     */
    long countByCollectionId(Integer collectionId);
}
