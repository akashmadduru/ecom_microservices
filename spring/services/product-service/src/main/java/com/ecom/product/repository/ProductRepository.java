package com.ecom.product.repository;

import com.ecom.product.model.Product;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * ProductRepository: repository for Product entities with full-text search and filtering.
 *
 * Implements TSVECTOR-based full-text search via PostgreSQL.
 */
public interface ProductRepository extends BaseRepository<Product, Integer> {
    Optional<Product> findBySlug(String slug);

    Optional<Product> findByUniqId(String uniqId);

    /**
     * Full-text search using TSVECTOR and tsquery.
     * Example: findByFullTextSearch("laptop") searches title and description.
     */
    @Query(value = "SELECT * FROM products WHERE search_document @@ to_tsquery('english', :query) AND is_deleted = FALSE", nativeQuery = true)
    Page<Product> findByFullTextSearch(@Param("query") String query, Pageable pageable);

    /**
     * Full-text search with prefix matching (e.g., "laptop:*" matches "laptop", "laptops", etc.).
     */
    @Query(value = "SELECT * FROM products WHERE search_document @@ to_tsquery('english', :query || ':*') AND is_deleted = FALSE", nativeQuery = true)
    Page<Product> findByFullTextSearchPrefix(@Param("query") String query, Pageable pageable);

    /**
     * Find published products by category.
     */
    @Query("SELECT p FROM Product p WHERE p.categoryId = :categoryId AND p.status = 'PUBLISHED' AND p.isDeleted = FALSE ORDER BY p.createdAt DESC")
    Page<Product> findPublishedByCategory(@Param("categoryId") Integer categoryId, Pageable pageable);

    /**
     * Find published products by brand.
     */
    @Query("SELECT p FROM Product p WHERE p.brandId = :brandId AND p.status = 'PUBLISHED' AND p.isDeleted = FALSE ORDER BY p.createdAt DESC")
    Page<Product> findPublishedByBrand(@Param("brandId") Integer brandId, Pageable pageable);

    /**
     * Find products by seller (with ownership checking).
     */
    @Query("SELECT p FROM Product p WHERE p.sellerId = :sellerId AND p.isDeleted = FALSE ORDER BY p.createdAt DESC")
    Page<Product> findBySeller(@Param("sellerId") String sellerId, Pageable pageable);

    /**
     * Find published products (active catalog).
     */
    @Query("SELECT p FROM Product p WHERE p.status = 'PUBLISHED' AND p.isDeleted = FALSE ORDER BY p.createdAt DESC")
    Page<Product> findAllPublished(Pageable pageable);

    /**
     * Find products by status.
     */
    @Query("SELECT p FROM Product p WHERE p.status = :status AND p.isDeleted = FALSE ORDER BY p.createdAt DESC")
    Page<Product> findByStatus(@Param("status") String status, Pageable pageable);

    /**
     * Find products in a category subtree using ltree (all descendants).
     */
    @Query(value = "SELECT p.* FROM products p JOIN categories c ON p.category_id = c.id " +
           "WHERE c.path::ltree <@ CAST(:categoryPath AS ltree) AND p.status = 'PUBLISHED' AND p.is_deleted = FALSE", nativeQuery = true)
    Page<Product> findPublishedInCategorySubtree(@Param("categoryPath") String categoryPath, Pageable pageable);

    /**
     * Find products with price filtering.
     */
    @Query("SELECT p FROM Product p WHERE p.retailPrice BETWEEN :minPrice AND :maxPrice AND p.status = 'PUBLISHED' AND p.isDeleted = FALSE")
    Page<Product> findByPriceRange(@Param("minPrice") java.math.BigDecimal minPrice, @Param("maxPrice") java.math.BigDecimal maxPrice, Pageable pageable);

    /**
     * Count products by status.
     */
    @Query("SELECT COUNT(p) FROM Product p WHERE p.status = :status AND p.isDeleted = FALSE")
    long countByStatus(@Param("status") String status);

    /**
     * Check if product exists (not soft-deleted).
     */
    @Query("SELECT COUNT(p) > 0 FROM Product p WHERE p.id = :id AND p.isDeleted = FALSE")
    boolean existsNotDeleted(@Param("id") Integer id);

    /**
     * Find recently updated products (for catalog sync).
     */
    @Query("SELECT p FROM Product p WHERE p.updatedAt >= :since AND p.isDeleted = FALSE ORDER BY p.updatedAt DESC")
    List<Product> findRecentlyUpdated(@Param("since") java.time.LocalDateTime since);
}
