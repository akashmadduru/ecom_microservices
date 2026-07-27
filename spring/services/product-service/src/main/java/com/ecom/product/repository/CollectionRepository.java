package com.ecom.product.repository;

import com.ecom.product.model.Collection;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * CollectionRepository: repository for Collection entities.
 */
public interface CollectionRepository extends BaseRepository<Collection, Integer> {
    Optional<Collection> findBySlug(String slug);

    @Query("SELECT c FROM Collection c WHERE c.isActive = TRUE ORDER BY c.createdAt DESC")
    Page<Collection> findAllActive(Pageable pageable);

    @Query("SELECT c FROM Collection c WHERE c.isActive = TRUE AND " +
           "(c.startsAt IS NULL OR c.startsAt <= :now) AND " +
           "(c.endsAt IS NULL OR c.endsAt >= :now)")
    List<Collection> findActiveNow(@Param("now") LocalDateTime now);

    /**
     * Find collections that are currently running (started but not ended).
     */
    @Query("SELECT c FROM Collection c WHERE c.isActive = TRUE AND " +
           "c.startsAt <= :now AND (c.endsAt IS NULL OR c.endsAt >= :now) " +
           "ORDER BY c.startsAt DESC")
    List<Collection> findRunningNow(@Param("now") LocalDateTime now);
}
