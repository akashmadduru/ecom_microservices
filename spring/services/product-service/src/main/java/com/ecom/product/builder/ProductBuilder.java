package com.ecom.product.builder;

import com.ecom.product.model.ProductImage;
import com.ecom.product.model.ProductVariant;
import com.ecom.product.model.Products;
import org.springframework.security.core.parameters.P;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

public class ProductBuilder {

        private Integer id;

        private String uniqId;

        private String title;

        private String slug;

        private String productUrl;

        private BigDecimal retailPrice = BigDecimal.ZERO;

        private BigDecimal discount = BigDecimal.ZERO;

        private String imageUrls;

        private String description;

        private String category;

        private String subCategory;

        private String brand;

        private BigDecimal rating = BigDecimal.ZERO;

        private Integer reviewCount = 0;

        private String sellerId;

        private Integer brandId;

        private Integer manufacturerId;

        private Integer categoryId;

        private String status = "DRAFT";

        private String seoTitle;

        private String seoDescription;

        private String canonicalUrl;

        private String[] metaKeywords;

        private String attributes = "{}";

        private String searchDocument;

        private String createdBy;

        private String updatedBy;

        private Boolean isDeleted = false;

        private LocalDateTime deletedAt;

        private String deletedBy;

        private Integer version = 1;

        private LocalDateTime createdAt;

        private LocalDateTime updatedAt;

        private List<ProductVariant> variants = new ArrayList<>();

        private List<ProductImage> images = new ArrayList<>();

        public ProductBuilder uniqId(String uniqId) {
            this.uniqId = uniqId;
            return this;
        }


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
        public String[] getMetaKeywords() { return this.metaKeywords; }
        public void setMetaKeywords(String[] metaKeywords) { this.metaKeywords = metaKeywords; }
        public String getAttributes() { return this.attributes; }
        public void setAttributes(String attributes) { this.attributes = attributes; }
        public String getSearchDocument() { return this.searchDocument; }
        public void setSearchDocument(String searchDocument) { this.searchDocument = searchDocument; }
        public String getCreatedBy() { return this.createdBy; }
        public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
        public String getUpdatedBy() { return this.updatedBy; }
        public void setUpdatedBy(String updatedBy) { this.updatedBy = updatedBy; }
        public Boolean getIsDeleted() { return this.isDeleted; }
        public void setIsDeleted(Boolean isDeleted) { this.isDeleted = isDeleted; }
        public LocalDateTime getDeletedAt() { return this.deletedAt; }
        public void setDeletedAt(LocalDateTime deletedAt) { this.deletedAt = deletedAt; }
        public String getDeletedBy() { return this.deletedBy; }
        public void setDeletedBy(String deletedBy) { this.deletedBy = deletedBy; }
        public Integer getVersion() { return this.version; }
        public void setVersion(Integer version) { this.version = version; }
        public LocalDateTime getCreatedAt() { return this.createdAt; }
        public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
        public LocalDateTime getUpdatedAt() { return this.updatedAt; }
        public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
        public List<ProductVariant> getVariants() { return this.variants; }
        public void setVariants(List<ProductVariant> variants) { this.variants = variants; }
        public List<ProductImage> getImages() { return this.images; }
        public void setImages(List<ProductImage> images) { this.images = images; }


        @Override
        public String toString() {
            return "Product{" +
                    "id=" + id +
                    ", uniqId='" + uniqId + '\'' +
                    ", title='" + title + '\'' +
                    ", slug='" + slug + '\'' +
                    ", productUrl='" + productUrl + '\'' +
                    ", retailPrice=" + retailPrice +
                    ", discount=" + discount +
                    ", imageUrls='" + imageUrls + '\'' +
                    ", description='" + description + '\'' +
                    ", category='" + category + '\'' +
                    ", subCategory='" + subCategory + '\'' +
                    ", brand='" + brand + '\'' +
                    ", rating=" + rating +
                    ", reviewCount=" + reviewCount +
                    ", sellerId='" + sellerId + '\'' +
                    ", brandId=" + brandId +
                    ", manufacturerId=" + manufacturerId +
                    ", categoryId=" + categoryId +
                    ", status='" + status + '\'' +
                    ", seoTitle='" + seoTitle + '\'' +
                    ", seoDescription='" + seoDescription + '\'' +
                    ", canonicalUrl='" + canonicalUrl + '\'' +
                    ", attributes='" + attributes + '\'' +
                    ", searchDocument='" + searchDocument + '\'' +
                    ", createdBy='" + createdBy + '\'' +
                    ", updatedBy='" + updatedBy + '\'' +
                    ", isDeleted=" + isDeleted +
                    ", deletedAt=" + deletedAt +
                    ", deletedBy='" + deletedBy + '\'' +
                    ", version=" + version +
                    ", createdAt=" + createdAt +
                    ", updatedAt=" + updatedAt +
                    '}';
        }
    }
