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
 * Brand: represents a product brand.
 */
@Entity
@Table(name = "brands", indexes = {
    @Index(name = "idx_brand_name", columnList = "name"),
    @Index(name = "idx_brand_slug", columnList = "slug")
})
@DynamicInsert
@DynamicUpdate
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@ToString
public class Brand {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(nullable = false, unique = true, length = 200)
    private String name;

    @Column(nullable = false, unique = true, length = 220)
    private String slug;

    @Column(name = "logo_url", columnDefinition = "text")
    private String logoUrl;

    @Column(name = "manufacturer_id")
    private Integer manufacturerId;

    @Column(columnDefinition = "text")
    private String description;

    @Column(nullable = false, name = "is_active")
    private Boolean isActive = true;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(nullable = false)
    private LocalDateTime updatedAt;

    public Brand(String name, String slug) {
        this.name = name;
        this.slug = slug;
        this.isActive = true;
    }
}
