package com.ecom.product.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.LocalDateTime;

/**
 * CollectionResponse: DTO for collection API response.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class CollectionResponse {
    private Integer id;
    private String name;
    private String slug;
    private String description;

    @JsonProperty("is_active")
    private Boolean isActive;

    @JsonProperty("starts_at")
    private LocalDateTime startsAt;

    @JsonProperty("ends_at")
    private LocalDateTime endsAt;

    public CollectionResponse() {}

    public CollectionResponse(Integer id, String name, String slug, String description, Boolean isActive, LocalDateTime startsAt, LocalDateTime endsAt) {
        this.id = id;
        this.name = name;
        this.slug = slug;
        this.description = description;
        this.isActive = isActive;
        this.startsAt = startsAt;
        this.endsAt = endsAt;
    }

    public Integer getId() { return this.id; }
    public void setId(Integer id) { this.id = id; }
    public String getName() { return this.name; }
    public void setName(String name) { this.name = name; }
    public String getSlug() { return this.slug; }
    public void setSlug(String slug) { this.slug = slug; }
    public String getDescription() { return this.description; }
    public void setDescription(String description) { this.description = description; }
    public Boolean getIsActive() { return this.isActive; }
    public void setIsActive(Boolean isActive) { this.isActive = isActive; }
    public LocalDateTime getStartsAt() { return this.startsAt; }
    public void setStartsAt(LocalDateTime startsAt) { this.startsAt = startsAt; }
    public LocalDateTime getEndsAt() { return this.endsAt; }
    public void setEndsAt(LocalDateTime endsAt) { this.endsAt = endsAt; }
}
