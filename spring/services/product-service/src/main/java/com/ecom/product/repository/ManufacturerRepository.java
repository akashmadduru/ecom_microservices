package com.ecom.product.repository;

import com.ecom.product.model.Manufacturer;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * ManufacturerRepository: repository for Manufacturer entities.
 */
public interface ManufacturerRepository extends BaseRepository<Manufacturer, Integer> {
    Optional<Manufacturer> findByName(String name);

    @Query("SELECT m FROM Manufacturer m WHERE m.countryOfOrigin = :countryCode")
    List<Manufacturer> findByCountryOfOrigin(@Param("countryCode") String countryCode);
}
