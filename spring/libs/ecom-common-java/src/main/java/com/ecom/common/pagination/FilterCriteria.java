package com.ecom.common.pagination;

import java.util.List;
import java.util.Map;

/**
 * Filter criteria for catalog queries.
 * Supports search, category filtering, price range, sorting, and generic attributes.
 *
 * Note: Lombok annotations removed due to Java 25 compatibility issues.
 */
public class FilterCriteria {
    private String search;
    private Integer categoryId;
    private Integer brandId;
    private List<Integer> tagIds;
    private Double minPrice;
    private Double maxPrice;
    private String sortBy;  // e.g., "created_at", "-price" (- for descending)
    private Boolean isActive;
    private Map<String, Object> attributes;  // Generic attribute filters

    public FilterCriteria() {
    }

    public FilterCriteria(String search, Integer categoryId, Integer brandId, List<Integer> tagIds,
                          Double minPrice, Double maxPrice, String sortBy, Boolean isActive, Map<String, Object> attributes) {
        this.search = search;
        this.categoryId = categoryId;
        this.brandId = brandId;
        this.tagIds = tagIds;
        this.minPrice = minPrice;
        this.maxPrice = maxPrice;
        this.sortBy = sortBy;
        this.isActive = isActive;
        this.attributes = attributes;
    }

    // Getters and Setters
    public String getSearch() {
        return search;
    }

    public void setSearch(String search) {
        this.search = search;
    }

    public Integer getCategoryId() {
        return categoryId;
    }

    public void setCategoryId(Integer categoryId) {
        this.categoryId = categoryId;
    }

    public Integer getBrandId() {
        return brandId;
    }

    public void setBrandId(Integer brandId) {
        this.brandId = brandId;
    }

    public List<Integer> getTagIds() {
        return tagIds;
    }

    public void setTagIds(List<Integer> tagIds) {
        this.tagIds = tagIds;
    }

    public Double getMinPrice() {
        return minPrice;
    }

    public void setMinPrice(Double minPrice) {
        this.minPrice = minPrice;
    }

    public Double getMaxPrice() {
        return maxPrice;
    }

    public void setMaxPrice(Double maxPrice) {
        this.maxPrice = maxPrice;
    }

    public String getSortBy() {
        return sortBy;
    }

    public void setSortBy(String sortBy) {
        this.sortBy = sortBy;
    }

    public Boolean getIsActive() {
        return isActive;
    }

    public void setIsActive(Boolean isActive) {
        this.isActive = isActive;
    }

    public Map<String, Object> getAttributes() {
        return attributes;
    }

    public void setAttributes(Map<String, Object> attributes) {
        this.attributes = attributes;
    }

    /**
     * Parse sort parameter string into field and direction.
     * Format: "-field" for descending, "field" for ascending.
     * Example: "-price" -> ["price", "DESC"], "name" -> ["name", "ASC"]
     *
     * @return array of [field, direction] or null if sortBy is null
     */
    public String[] parseSortBy() {
        if (sortBy == null || sortBy.isEmpty()) {
            return null;
        }

        if (sortBy.startsWith("-")) {
            return new String[]{sortBy.substring(1), "DESC"};
        }

        return new String[]{sortBy, "ASC"};
    }

    @Override
    public String toString() {
        return "FilterCriteria{" +
                "search='" + search + '\'' +
                ", categoryId=" + categoryId +
                ", brandId=" + brandId +
                ", tagIds=" + tagIds +
                ", minPrice=" + minPrice +
                ", maxPrice=" + maxPrice +
                ", sortBy='" + sortBy + '\'' +
                ", isActive=" + isActive +
                ", attributes=" + attributes +
                '}';
    }
}
