package com.ecom.product.repository;

import com.ecom.product.model.Tag;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * TagRepository: repository for Tag entities.
 */
public interface TagRepository extends BaseRepository<Tag, Integer> {
    Optional<Tag> findBySlug(String slug);

    Optional<Tag> findByName(String name);

    @Query("SELECT t FROM Tag t WHERE t.id IN :ids")
    List<Tag> findByIds(@Param("ids") List<Integer> ids);
}
