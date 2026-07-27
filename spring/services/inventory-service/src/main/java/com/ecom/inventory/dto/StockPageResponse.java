package com.ecom.inventory.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/**
 * StockPageResponse: Pagination wrapper for stock history results.
 * Matches Product Service pattern for consistency.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class StockPageResponse {
    private List<StockHistoryResponse> data;
    private Integer page;
    private Integer limit;
    @JsonProperty("total_items")
    private Long totalItems;
    @JsonProperty("total_pages")
    private Integer totalPages;
    @JsonProperty("has_more")
    private Boolean hasMore;

    public StockPageResponse() {
    }

    public List<StockHistoryResponse> getData() { return data; }
    public void setData(List<StockHistoryResponse> data) { this.data = data; }
    public Integer getPage() { return page; }
    public void setPage(Integer page) { this.page = page; }
    public Integer getLimit() { return limit; }
    public void setLimit(Integer limit) { this.limit = limit; }
    public Long getTotalItems() { return totalItems; }
    public void setTotalItems(Long totalItems) { this.totalItems = totalItems; }
    public Integer getTotalPages() { return totalPages; }
    public void setTotalPages(Integer totalPages) { this.totalPages = totalPages; }
    public Boolean getHasMore() { return hasMore; }
    public void setHasMore(Boolean hasMore) { this.hasMore = hasMore; }
}
