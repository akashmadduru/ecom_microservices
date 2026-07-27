package com.ecom.product.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.ToString;

/**
 * CollectionProduct: junction table for Collection-Product many-to-many relationship.
 * Includes sort_order for ordering products within a collection.
 */
@Entity
@Table(name = "collection_products")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@ToString
@IdClass(CollectionProductId.class)
public class CollectionProduct {
    @Id
    @Column(name = "collection_id")
    private Integer collectionId;

    @Id
    @Column(name = "product_id")
    private Integer productId;

    @Column(nullable = false, name = "sort_order")
    private Integer sortOrder = 0;
}
