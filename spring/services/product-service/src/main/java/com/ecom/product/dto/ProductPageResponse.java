package com.ecom.product.dto;

import com.ecom.common.pagination.Page;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;

/**
 * ProductPageResponse: DTO for paginated product list response.
 * Matches FastAPI ProductPage schema.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ProductPageResponse {
    private List<ProductResponse> products;

    @JsonProperty("pagination")
    private PaginationResponse pagination;

    public static ProductPageResponse from(Page<ProductResponse> page) {
        return ProductPageResponse.builder()
                .products(page.getData())
                .pagination(PaginationResponse.builder()
                        .page(page.getPage())
                        .limit(page.getLimit())
                        .total(page.getTotal())
                        .totalPages(page.getTotalPages())
                        .hasMore(page.hasMore())
                        .build())
                .build();
    }
}
