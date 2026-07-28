package com.ecom.product.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Size;
import lombok.Builder;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * ProductUpdateRequest: DTO for updating an existing product.
 * Matches FastAPI ProductUpdate schema.
 */
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

    public ProductUpdateRequest() {}

    public String getTitle() { return this.title; }
    public void setTitle(String title) { this.title = title; }
    public String getSlug() { return this.slug; }
    public void setSlug(String slug) { this.slug = slug; }
    public String getProductUrl() { return this.productUrl; }
    public void setProductUrl(String productUrl) { this.productUrl = productUrl; }
    public BigDecimal getRetailPrice() { return this.retailPrice; }
    public void setRetailPrice(BigDecimal retailPrice) { this.retailPrice = retailPrice; }
    public BigDecimal getDiscount() { return this.discount; }
    public void setDiscount(BigDecimal discount) { this.discount = discount; }
    public String getImageUrls() { return this.imageUrls; }
    public void setImageUrls(String imageUrls) { this.imageUrls = imageUrls; }
    public String getDescription() { return this.description; }
    public void setDescription(String description) { this.description = description; }
    public String getCategory() { return this.category; }
    public void setCategory(String category) { this.category = category; }
    public String getSubCategory() { return this.subCategory; }
    public void setSubCategory(String subCategory) { this.subCategory = subCategory; }
    public String getBrand() { return this.brand; }
    public void setBrand(String brand) { this.brand = brand; }
    public Integer getBrandId() { return this.brandId; }
    public void setBrandId(Integer brandId) { this.brandId = brandId; }
    public Integer getManufacturerId() { return this.manufacturerId; }
    public void setManufacturerId(Integer manufacturerId) { this.manufacturerId = manufacturerId; }
    public Integer getCategoryId() { return this.categoryId; }
    public void setCategoryId(Integer categoryId) { this.categoryId = categoryId; }
    public String getSeoTitle() { return this.seoTitle; }
    public void setSeoTitle(String seoTitle) { this.seoTitle = seoTitle; }
    public String getSeoDescription() { return this.seoDescription; }
    public void setSeoDescription(String seoDescription) { this.seoDescription = seoDescription; }
    public String getCanonicalUrl() { return this.canonicalUrl; }
    public void setCanonicalUrl(String canonicalUrl) { this.canonicalUrl = canonicalUrl; }
    public List<String> getMetaKeywords() { return this.metaKeywords; }
    public void setMetaKeywords(List<String> metaKeywords) { this.metaKeywords = metaKeywords; }
    public Map<String, Object> getAttributes() { return this.attributes; }
    public void setAttributes(Map<String, Object> attributes) { this.attributes = attributes; }
}
