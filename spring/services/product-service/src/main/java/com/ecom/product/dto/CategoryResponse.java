package com.ecom.product.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * CategoryResponse: DTO for category API response.
 */
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

    public CategoryResponse() {}

    public CategoryResponse(Integer id, Integer parentId, String name, String slug, String path, Integer depth, Boolean isActive, Integer sortOrder) {
        this.id = id;
        this.parentId = parentId;
        this.name = name;
        this.slug = slug;
        this.path = path;
        this.depth = depth;
        this.isActive = isActive;
        this.sortOrder = sortOrder;
    }

    public Integer getId() { return this.id; }
    public void setId(Integer id) { this.id = id; }
    public Integer getParentId() { return this.parentId; }
    public void setParentId(Integer parentId) { this.parentId = parentId; }
    public String getName() { return this.name; }
    public void setName(String name) { this.name = name; }
    public String getSlug() { return this.slug; }
    public void setSlug(String slug) { this.slug = slug; }
    public String getPath() { return this.path; }
    public void setPath(String path) { this.path = path; }
    public Integer getDepth() { return this.depth; }
    public void setDepth(Integer depth) { this.depth = depth; }
    public Boolean getIsActive() { return this.isActive; }
    public void setIsActive(Boolean isActive) { this.isActive = isActive; }
    public Integer getSortOrder() { return this.sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
}
