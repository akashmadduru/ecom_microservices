package com.ecom.product.model;

import jakarta.persistence.*;

/**
 * CollectionProduct: junction table for Collection-Product many-to-many relationship.
 * Includes sort_order for ordering products within a collection.
 */
@Entity
@Table()
@IdClass(CollectionProductId.class)
public class CollectionProduct {
    @Id
    @Column()
    private Integer collectionId;

    @Id
    @Column()
    private Integer productId;

    @Column(nullable = false)
    private Integer sortOrder = 0;

    public CollectionProduct() {
    }

    public CollectionProduct(Integer collectionId, Integer productId) {
        this.collectionId = collectionId;
        this.productId = productId;
    }

    public CollectionProduct(Integer collectionId, Integer productId, Integer sortOrder) {
        this.collectionId = collectionId;
        this.productId = productId;
        this.sortOrder = sortOrder;
    }

    public Integer getCollectionId() {
        return this.collectionId;
    }

    public void setCollectionId(Integer collectionId) {
        this.collectionId = collectionId;
    }

    public Integer getProductId() {
        return this.productId;
    }

    public void setProductId(Integer productId) {
        this.productId = productId;
    }

    public Integer getSortOrder() {
        return this.sortOrder;
    }

    public void setSortOrder(Integer sortOrder) {
        this.sortOrder = sortOrder;
    }

    @Override
    public String toString() {
        return "CollectionProduct{" +
                "collectionId=" + collectionId +
                ", productId=" + productId +
                ", sortOrder=" + sortOrder +
                '}';
    }
}
