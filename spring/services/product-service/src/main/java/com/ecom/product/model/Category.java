package com.ecom.product.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.ToString;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.DynamicInsert;
import org.hibernate.annotations.DynamicUpdate;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * Category: self-referencing catalog hierarchy using materialized-path approach.
 *
 * The 'path' field is a dot-separated slug string (e.g., "electronics.mobiles.smartphones").
 * PostgreSQL ltree extension is used for indexed subtree queries on path::ltree.
 */
@Entity
@Table(name = "categories", indexes = {
    @Index(name = "idx_category_slug", columnList = "slug")
},
uniqueConstraints = {
    @UniqueConstraint(name = "uq_categories_parent_name", columnNames = {"parent_id", "name"})
})
@DynamicInsert
@DynamicUpdate
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@ToString
public class Category {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "parent_id")
    private Integer parentId;

    @Column(nullable = false, length = 150)
    private String name;

    @Column(nullable = false, unique = true, length = 170)
    private String slug;

    @Column(nullable = false, columnDefinition = "text")
    private String path;  // e.g., "electronics.mobiles.smartphones"

    @Column(nullable = false)
    private Integer depth = 0;

    @Column(nullable = false, name = "is_active")
    private Boolean isActive = true;

    @Column(nullable = false, name = "sort_order")
    private Integer sortOrder = 0;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(nullable = false)
    private LocalDateTime updatedAt;

    public Category(String name, String slug, String path) {
        this.name = name;
        this.slug = slug;
        this.path = path;
        this.isActive = true;
        this.depth = path.split("\\.").length - 1;
    }
}
