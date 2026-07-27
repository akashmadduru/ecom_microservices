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
 * Manufacturer: represents a product manufacturer (OEM).
 */
@Entity
@Table(name = "manufacturers", indexes = {
    @Index(name = "idx_manufacturer_name", columnList = "name")
})
@DynamicInsert
@DynamicUpdate
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@ToString
public class Manufacturer {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(nullable = false, unique = true, length = 200)
    private String name;

    @Column(name = "country_of_origin", length = 2)
    private String countryOfOrigin;  // ISO alpha-2

    @Column(columnDefinition = "jsonb")
    private String contactInfo;  // JSONB as String for now

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(nullable = false)
    private LocalDateTime updatedAt;

    public Manufacturer(String name) {
        this.name = name;
    }
}
