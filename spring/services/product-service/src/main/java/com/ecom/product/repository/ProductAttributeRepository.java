package com.ecom.product.repository;

import com.ecom.product.model.ProductAttribute;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * ProductAttributeRepository: repository for ProductAttribute entities.
 */
public interface ProductAttributeRepository extends BaseRepository<ProductAttribute, Integer> {
    Optional<ProductAttribute> findByCode(String code);

    Optional<ProductAttribute> findByName(String name);

    @Query("SELECT pa FROM ProductAttribute pa WHERE pa.isVariantDefining = TRUE ORDER BY pa.sortOrder ASC")
    List<ProductAttribute> findVariantDefiningAttributes();
}
