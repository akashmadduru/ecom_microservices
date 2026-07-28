package com.ecom.product.dto;

import com.ecom.common.pagination.Page;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/**
 * ProductPageResponse: DTO for paginated product list response.
 * Matches FastAPI ProductPage schema.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ProductPageResponse {
    private List<ProductResponse> products;

    @JsonProperty("pagination")
    private PaginationResponse pagination;

    public ProductPageResponse() {}

    public ProductPageResponse(List<ProductResponse> products, PaginationResponse pagination) {
        this.products = products;
        this.pagination = pagination;
    }

    public List<ProductResponse> getProducts() { return this.products; }
    public void setProducts(List<ProductResponse> products) { this.products = products; }
    public PaginationResponse getPagination() { return this.pagination; }
    public void setPagination(PaginationResponse pagination) { this.pagination = pagination; }

    public static ProductPageResponse from(Page<ProductResponse> page) {
        PaginationResponse paginationResponse = new PaginationResponse(
                page.getPage(),
                page.getLimit(),
                page.getTotal(),
                page.getTotalPages(),
                page.hasMore()
        );
        return new ProductPageResponse(page.getData(), paginationResponse);
    }
}
