package com.ecom.product.model;

import java.io.Serializable;
import java.util.Objects;

/**
 * ProductTagId: composite primary key for ProductTag junction table.
 */
public class ProductTagId implements Serializable {
    private Integer productId;
    private Integer tagId;

    public ProductTagId() {
    }

    public ProductTagId(Integer productId, Integer tagId) {
        this.productId = productId;
        this.tagId = tagId;
    }

    public Integer getProductId() {
        return this.productId;
    }

    public void setProductId(Integer productId) {
        this.productId = productId;
    }

    public Integer getTagId() {
        return this.tagId;
    }

    public void setTagId(Integer tagId) {
        this.tagId = tagId;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        ProductTagId that = (ProductTagId) o;
        return Objects.equals(productId, that.productId) &&
               Objects.equals(tagId, that.tagId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(productId, tagId);
    }
}
