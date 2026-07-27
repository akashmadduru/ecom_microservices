package com.ecom.product.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.Map;

/**
 * ManufacturerResponse: DTO for manufacturer API response.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ManufacturerResponse {
    private Integer id;
    private String name;

    @JsonProperty("country_of_origin")
    private String countryOfOrigin;

    @JsonProperty("contact_info")
    private Map<String, Object> contactInfo;
}
