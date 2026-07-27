package com.ecom.product.repository;

import com.ecom.product.model.Category;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * CategoryRepository: repository for Category entities with hierarchy support.
 *
 * Uses PostgreSQL ltree extension for efficient category tree queries.
 * Path format: dot-separated slugs (e.g., "electronics.mobiles.smartphones")
 */
public interface CategoryRepository extends BaseRepository<Category, Integer> {
    Optional<Category> findBySlug(String slug);

    Optional<Category> findByPath(String path);

    @Query("SELECT c FROM Category c WHERE c.parentId IS NULL")
    List<Category> findRootCategories();

    @Query("SELECT c FROM Category c WHERE c.parentId = :parentId ORDER BY c.sortOrder ASC")
    List<Category> findChildrenOf(@Param("parentId") Integer parentId);

    /**
     * Find all descendants of a category using PostgreSQL ltree.
     * Example: findSubtree("electronics.mobiles") returns all subcategories under mobiles.
     */
    @Query(value = "SELECT * FROM categories WHERE path::ltree <@ CAST(:parentPath AS ltree) AND path != :parentPath ORDER BY path", nativeQuery = true)
    List<Category> findSubtree(@Param("parentPath") String parentPath);

    /**
     * Find all categories at a specific depth.
     */
    @Query("SELECT c FROM Category c WHERE c.depth = :depth ORDER BY c.sortOrder ASC")
    Page<Category> findByDepth(@Param("depth") Integer depth, Pageable pageable);

    /**
     * Find active categories only.
     */
    @Query("SELECT c FROM Category c WHERE c.isActive = TRUE ORDER BY c.sortOrder ASC")
    List<Category> findAllActive();

    boolean existsByPath(String path);
}
