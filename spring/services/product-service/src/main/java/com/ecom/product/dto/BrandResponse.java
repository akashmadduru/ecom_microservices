package com.ecom.product.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * BrandResponse: DTO for brand API response.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class BrandResponse {
    private Integer id;
    private String name;
    private String slug;

    @JsonProperty("logo_url")
    private String logoUrl;

    @JsonProperty("manufacturer_id")
    private Integer manufacturerId;

    private String description;

    @JsonProperty("is_active")
    private Boolean isActive;
}
