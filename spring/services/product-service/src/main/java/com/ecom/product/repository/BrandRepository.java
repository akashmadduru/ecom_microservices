package com.ecom.product.repository;

import com.ecom.product.model.Brand;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

/**
 * BrandRepository: repository for Brand entities.
 */
public interface BrandRepository extends BaseRepository<Brand, Integer> {
    Optional<Brand> findByName(String name);

    Optional<Brand> findBySlug(String slug);

    @Query("SELECT b FROM Brand b WHERE b.isActive = TRUE")
    Page<Brand> findAllActive(Pageable pageable);

    @Query("SELECT COUNT(b) > 0 FROM Brand b WHERE b.manufacturerId = :manufacturerId")
    boolean existsByManufacturerId(@Param("manufacturerId") Integer manufacturerId);
}
