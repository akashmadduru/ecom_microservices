package com.ecom.product.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * TagResponse: DTO for tag API response.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class TagResponse {
    private Integer id;
    private String name;
    private String slug;

    public TagResponse() {}

    public TagResponse(Integer id, String name, String slug) {
        this.id = id;
        this.name = name;
        this.slug = slug;
    }

    public Integer getId() { return this.id; }
    public void setId(Integer id) { this.id = id; }
    public String getName() { return this.name; }
    public void setName(String name) { this.name = name; }
    public String getSlug() { return this.slug; }
    public void setSlug(String slug) { this.slug = slug; }
}
