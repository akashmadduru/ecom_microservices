package com.ecom.product.model;

import jakarta.persistence.*;

/**
 * ProductTag: junction table for Product-Tag many-to-many relationship.
 */
@Entity
@Table(name = "product_tags")
@IdClass(ProductTagId.class)
public class ProductTag {
    @Id
    @Column(name = "product_id")
    private Integer productId;

    @Id
    @Column(name = "tag_id")
    private Integer tagId;

    public ProductTag() {
    }

    public ProductTag(Integer productId, Integer tagId) {
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
    public String toString() {
        return "ProductTag{" +
                "productId=" + productId +
                ", tagId=" + tagId +
                '}';
    }
}
