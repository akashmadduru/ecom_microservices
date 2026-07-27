package com.ecom.product.model;

import java.io.Serializable;
import java.util.Objects;

/**
 * CollectionProductId: composite primary key for CollectionProduct junction table.
 */
public class CollectionProductId implements Serializable {
    private Integer collectionId;
    private Integer productId;

    public CollectionProductId() {
    }

    public CollectionProductId(Integer collectionId, Integer productId) {
        this.collectionId = collectionId;
        this.productId = productId;
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

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        CollectionProductId that = (CollectionProductId) o;
        return Objects.equals(collectionId, that.collectionId) &&
               Objects.equals(productId, that.productId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(collectionId, productId);
    }
}
