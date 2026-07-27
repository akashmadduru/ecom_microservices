package com.ecom.product.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.Map;

/**
 * ManufacturerResponse: DTO for manufacturer API response.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ManufacturerResponse {
    private Integer id;
    private String name;

    @JsonProperty("country_of_origin")
    private String countryOfOrigin;

    @JsonProperty("contact_info")
    private Map<String, Object> contactInfo;

    public ManufacturerResponse() {}

    public ManufacturerResponse(Integer id, String name, String countryOfOrigin, Map<String, Object> contactInfo) {
        this.id = id;
        this.name = name;
        this.countryOfOrigin = countryOfOrigin;
        this.contactInfo = contactInfo;
    }

    public Integer getId() { return this.id; }
    public void setId(Integer id) { this.id = id; }
    public String getName() { return this.name; }
    public void setName(String name) { this.name = name; }
    public String getCountryOfOrigin() { return this.countryOfOrigin; }
    public void setCountryOfOrigin(String countryOfOrigin) { this.countryOfOrigin = countryOfOrigin; }
    public Map<String, Object> getContactInfo() { return this.contactInfo; }
    public void setContactInfo(Map<String, Object> contactInfo) { this.contactInfo = contactInfo; }
}
