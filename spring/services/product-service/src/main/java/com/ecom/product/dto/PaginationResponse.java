package com.ecom.product.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * PaginationResponse: DTO for pagination metadata.
 */
public class PaginationResponse {
    private Integer page;
    private Integer limit;
    private Long total;

    @JsonProperty("total_pages")
    private Long totalPages;

    @JsonProperty("has_more")
    private Boolean hasMore;

    public PaginationResponse() {}

    public PaginationResponse(Integer page, Integer limit, Long total, Long totalPages, Boolean hasMore) {
        this.page = page;
        this.limit = limit;
        this.total = total;
        this.totalPages = totalPages;
        this.hasMore = hasMore;
    }

    public Integer getPage() { return this.page; }
    public void setPage(Integer page) { this.page = page; }
    public Integer getLimit() { return this.limit; }
    public void setLimit(Integer limit) { this.limit = limit; }
    public Long getTotal() { return this.total; }
    public void setTotal(Long total) { this.total = total; }
    public Long getTotalPages() { return this.totalPages; }
    public void setTotalPages(Long totalPages) { this.totalPages = totalPages; }
    public Boolean getHasMore() { return this.hasMore; }
    public void setHasMore(Boolean hasMore) { this.hasMore = hasMore; }
}
