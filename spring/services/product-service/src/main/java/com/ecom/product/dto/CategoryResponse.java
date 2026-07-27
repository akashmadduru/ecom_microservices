package com.ecom.product.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * CategoryResponse: DTO for category API response.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class CategoryResponse {
    private Integer id;

    @JsonProperty("parent_id")
    private Integer parentId;

    private String name;

    private String slug;

    private String path;

    private Integer depth;

    @JsonProperty("is_active")
    private Boolean isActive;

    @JsonProperty("sort_order")
    private Integer sortOrder;
}
