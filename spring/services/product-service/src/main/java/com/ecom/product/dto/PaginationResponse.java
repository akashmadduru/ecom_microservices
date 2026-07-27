package com.ecom.product.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * PaginationResponse: DTO for pagination metadata.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PaginationResponse {
    private Integer page;
    private Integer limit;
    private Long total;

    @JsonProperty("total_pages")
    private Long totalPages;

    @JsonProperty("has_more")
    private Boolean hasMore;
}
