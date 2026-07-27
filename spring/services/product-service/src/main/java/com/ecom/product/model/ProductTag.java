package com.ecom.product.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.ToString;

/**
 * ProductTag: junction table for Product-Tag many-to-many relationship.
 */
@Entity
@Table(name = "product_tags")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@ToString
@IdClass(ProductTagId.class)
public class ProductTag {
    @Id
    @Column(name = "product_id")
    private Integer productId;

    @Id
    @Column(name = "tag_id")
    private Integer tagId;
}
