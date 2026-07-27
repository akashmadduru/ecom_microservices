package com.ecom.product.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.ToString;

/**
 * Tag: keyword tags for products (e.g., "eco-friendly", "bestseller", "on-sale").
 */
@Entity
@Table(name = "tags", indexes = {
    @Index(name = "idx_tag_slug", columnList = "slug")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@ToString
public class Tag {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(nullable = false, unique = true, length = 80)
    private String name;

    @Column(nullable = false, unique = true, length = 90)
    private String slug;

    public Tag(String name, String slug) {
        this.name = name;
        this.slug = slug;
    }
}
