package com.ecom.product.repository;

import com.ecom.product.model.AttributeValue;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * AttributeValueRepository: repository for AttributeValue entities.
 */
public interface AttributeValueRepository extends BaseRepository<AttributeValue, Integer> {
    Optional<AttributeValue> findByAttributeIdAndValue(@Param("attributeId") Integer attributeId, @Param("value") String value);

    @Query("SELECT av FROM AttributeValue av WHERE av.attributeId = :attributeId ORDER BY av.sortOrder ASC")
    List<AttributeValue> findByAttributeId(@Param("attributeId") Integer attributeId);

    @Query("SELECT av FROM AttributeValue av WHERE av.slug IN :slugs")
    List<AttributeValue> findBySlugs(@Param("slugs") List<String> slugs);
}
