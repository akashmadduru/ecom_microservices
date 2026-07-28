package com.ecom.product.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * ProductResponse: DTO for product API response.
 * Matches FastAPI ProductResponse schema with snake_case JSON property names.
 */
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

    public ProductResponse() {}

    public Integer getId() { return this.id; }
    public void setId(Integer id) { this.id = id; }
    public String getUniqId() { return this.uniqId; }
    public void setUniqId(String uniqId) { this.uniqId = uniqId; }
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
    public BigDecimal getRating() { return this.rating; }
    public void setRating(BigDecimal rating) { this.rating = rating; }
    public Integer getReviewCount() { return this.reviewCount; }
    public void setReviewCount(Integer reviewCount) { this.reviewCount = reviewCount; }
    public String getSellerId() { return this.sellerId; }
    public void setSellerId(String sellerId) { this.sellerId = sellerId; }
    public Integer getBrandId() { return this.brandId; }
    public void setBrandId(Integer brandId) { this.brandId = brandId; }
    public Integer getManufacturerId() { return this.manufacturerId; }
    public void setManufacturerId(Integer manufacturerId) { this.manufacturerId = manufacturerId; }
    public Integer getCategoryId() { return this.categoryId; }
    public void setCategoryId(Integer categoryId) { this.categoryId = categoryId; }
    public String getStatus() { return this.status; }
    public void setStatus(String status) { this.status = status; }
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
    public LocalDateTime getCreatedAt() { return this.createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return this.updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }

    public static ProductResponseBuilder builder() {
        return new ProductResponseBuilder();
    }

    public static class ProductResponseBuilder {
        private Integer id;
        private String uniqId;
        private String title;
        private String slug;
        private String productUrl;
        private BigDecimal retailPrice;
        private BigDecimal discount;
        private String imageUrls;
        private String description;
        private String category;
        private String subCategory;
        private String brand;
        private BigDecimal rating;
        private Integer reviewCount;
        private String sellerId;
        private Integer brandId;
        private Integer manufacturerId;
        private Integer categoryId;
        private String status;
        private String seoTitle;
        private String seoDescription;
        private String canonicalUrl;
        private List<String> metaKeywords;
        private Map<String, Object> attributes;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public ProductResponseBuilder id(Integer id) { this.id = id; return this; }
        public ProductResponseBuilder uniqId(String uniqId) { this.uniqId = uniqId; return this; }
        public ProductResponseBuilder title(String title) { this.title = title; return this; }
        public ProductResponseBuilder slug(String slug) { this.slug = slug; return this; }
        public ProductResponseBuilder productUrl(String productUrl) { this.productUrl = productUrl; return this; }
        public ProductResponseBuilder retailPrice(BigDecimal retailPrice) { this.retailPrice = retailPrice; return this; }
        public ProductResponseBuilder discount(BigDecimal discount) { this.discount = discount; return this; }
        public ProductResponseBuilder imageUrls(String imageUrls) { this.imageUrls = imageUrls; return this; }
        public ProductResponseBuilder description(String description) { this.description = description; return this; }
        public ProductResponseBuilder category(String category) { this.category = category; return this; }
        public ProductResponseBuilder subCategory(String subCategory) { this.subCategory = subCategory; return this; }
        public ProductResponseBuilder brand(String brand) { this.brand = brand; return this; }
        public ProductResponseBuilder rating(BigDecimal rating) { this.rating = rating; return this; }
        public ProductResponseBuilder reviewCount(Integer reviewCount) { this.reviewCount = reviewCount; return this; }
        public ProductResponseBuilder sellerId(String sellerId) { this.sellerId = sellerId; return this; }
        public ProductResponseBuilder brandId(Integer brandId) { this.brandId = brandId; return this; }
        public ProductResponseBuilder manufacturerId(Integer manufacturerId) { this.manufacturerId = manufacturerId; return this; }
        public ProductResponseBuilder categoryId(Integer categoryId) { this.categoryId = categoryId; return this; }
        public ProductResponseBuilder status(String status) { this.status = status; return this; }
        public ProductResponseBuilder seoTitle(String seoTitle) { this.seoTitle = seoTitle; return this; }
        public ProductResponseBuilder seoDescription(String seoDescription) { this.seoDescription = seoDescription; return this; }
        public ProductResponseBuilder canonicalUrl(String canonicalUrl) { this.canonicalUrl = canonicalUrl; return this; }
        public ProductResponseBuilder metaKeywords(List<String> metaKeywords) { this.metaKeywords = metaKeywords; return this; }
        public ProductResponseBuilder attributes(Map<String, Object> attributes) { this.attributes = attributes; return this; }
        public ProductResponseBuilder createdAt(LocalDateTime createdAt) { this.createdAt = createdAt; return this; }
        public ProductResponseBuilder updatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; return this; }

        public ProductResponse build() {
            ProductResponse response = new ProductResponse();
            response.id = this.id;
            response.uniqId = this.uniqId;
            response.title = this.title;
            response.slug = this.slug;
            response.productUrl = this.productUrl;
            response.retailPrice = this.retailPrice;
            response.discount = this.discount;
            response.imageUrls = this.imageUrls;
            response.description = this.description;
            response.category = this.category;
            response.subCategory = this.subCategory;
            response.brand = this.brand;
            response.rating = this.rating;
            response.reviewCount = this.reviewCount;
            response.sellerId = this.sellerId;
            response.brandId = this.brandId;
            response.manufacturerId = this.manufacturerId;
            response.categoryId = this.categoryId;
            response.status = this.status;
            response.seoTitle = this.seoTitle;
            response.seoDescription = this.seoDescription;
            response.canonicalUrl = this.canonicalUrl;
            response.metaKeywords = this.metaKeywords;
            response.attributes = this.attributes;
            response.createdAt = this.createdAt;
            response.updatedAt = this.updatedAt;
            return response;
        }
    }
}
