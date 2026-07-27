package com.ecom.product.model;

import lombok.AllArgsConstructor;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.io.Serializable;

/**
 * CollectionProductId: composite primary key for CollectionProduct junction table.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode
public class CollectionProductId implements Serializable {
    private Integer collectionId;
    private Integer productId;
}
