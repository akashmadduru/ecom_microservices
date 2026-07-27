package com.ecom.product.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * ProductResponse: DTO for product API response.
 * Matches FastAPI ProductResponse schema with snake_case JSON property names.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ProductResponse {
    private Integer id;

    @JsonProperty("uniq_id")
    private String uniqId;

    private String title;

    private String slug;

    @JsonProperty("product_url")
    private String productUrl;

    @JsonProperty("retail_price")
    private BigDecimal retailPrice;

    private BigDecimal discount;

    @JsonProperty("image_urls")
    private String imageUrls;

    private String description;

    private String category;

    @JsonProperty("sub_category")
    private String subCategory;

    private String brand;

    private BigDecimal rating;

    @JsonProperty("review_count")
    private Integer reviewCount;

    @JsonProperty("seller_id")
    private String sellerId;

    @JsonProperty("brand_id")
    private Integer brandId;

    @JsonProperty("manufacturer_id")
    private Integer manufacturerId;

    @JsonProperty("category_id")
    private Integer categoryId;

    private String status;

    @JsonProperty("seo_title")
    private String seoTitle;

    @JsonProperty("seo_description")
    private String seoDescription;

    @JsonProperty("canonical_url")
    private String canonicalUrl;

    @JsonProperty("meta_keywords")
    private List<String> metaKeywords;

    private Map<String, Object> attributes;

    @JsonProperty("created_at")
    private LocalDateTime createdAt;

    @JsonProperty("updated_at")
    private LocalDateTime updatedAt;
}
