package com.ecom.product.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * BrandResponse: DTO for brand API response.
 */
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

    public BrandResponse() {}

    public BrandResponse(Integer id, String name, String slug, String logoUrl, Integer manufacturerId, String description, Boolean isActive) {
        this.id = id;
        this.name = name;
        this.slug = slug;
        this.logoUrl = logoUrl;
        this.manufacturerId = manufacturerId;
        this.description = description;
        this.isActive = isActive;
    }

    public Integer getId() { return this.id; }
    public void setId(Integer id) { this.id = id; }
    public String getName() { return this.name; }
    public void setName(String name) { this.name = name; }
    public String getSlug() { return this.slug; }
    public void setSlug(String slug) { this.slug = slug; }
    public String getLogoUrl() { return this.logoUrl; }
    public void setLogoUrl(String logoUrl) { this.logoUrl = logoUrl; }
    public Integer getManufacturerId() { return this.manufacturerId; }
    public void setManufacturerId(Integer manufacturerId) { this.manufacturerId = manufacturerId; }
    public String getDescription() { return this.description; }
    public void setDescription(String description) { this.description = description; }
    public Boolean getIsActive() { return this.isActive; }
    public void setIsActive(Boolean isActive) { this.isActive = isActive; }
}
