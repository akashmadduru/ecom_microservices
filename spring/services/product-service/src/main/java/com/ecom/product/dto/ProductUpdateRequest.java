package com.ecom.product.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * ProductUpdateRequest: DTO for updating an existing product.
 * Matches FastAPI ProductUpdate schema.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProductUpdateRequest {
    @Size(min = 1, max = 500)
    private String title;

    @Size(max = 320)
    private String slug;

    @JsonProperty("product_url")
    private String productUrl;

    @JsonProperty("retail_price")
    @DecimalMin("0")
    private BigDecimal retailPrice;

    @DecimalMin("0")
    private BigDecimal discount;

    @JsonProperty("image_urls")
    private String imageUrls;

    private String description;

    private String category;

    @JsonProperty("sub_category")
    private String subCategory;

    private String brand;

    @JsonProperty("brand_id")
    private Integer brandId;

    @JsonProperty("manufacturer_id")
    private Integer manufacturerId;

    @JsonProperty("category_id")
    private Integer categoryId;

    @JsonProperty("seo_title")
    @Size(max = 255)
    private String seoTitle;

    @JsonProperty("seo_description")
    @Size(max = 500)
    private String seoDescription;

    @JsonProperty("canonical_url")
    private String canonicalUrl;

    @JsonProperty("meta_keywords")
    private List<String> metaKeywords;

    private Map<String, Object> attributes;
}
