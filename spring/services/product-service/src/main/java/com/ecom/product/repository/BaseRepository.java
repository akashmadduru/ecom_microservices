package com.ecom.product.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.repository.NoRepositoryBean;

/**
 * BaseRepository: Base interface for all product-service repositories.
 * Provides common CRUD operations through Spring Data JPA.
 *
 * @param <T> Entity type
 * @param <ID> Primary key type
 */
@NoRepositoryBean
public interface BaseRepository<T, ID> extends JpaRepository<T, ID> {
}
