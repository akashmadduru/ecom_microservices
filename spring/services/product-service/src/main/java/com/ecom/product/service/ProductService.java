package com.ecom.product.service;

import com.ecom.common.event.EventEnvelope;
import com.ecom.common.event.EventType;
import com.ecom.common.event.Topics;
import com.ecom.common.exception.ConflictException;
import com.ecom.common.exception.ForbiddenException;
import com.ecom.common.exception.NotFoundException;
import com.ecom.common.exception.ValidationException;
import com.ecom.common.pagination.Page;
import com.ecom.common.pagination.PageRequest;
import com.ecom.product.dto.ProductCreateRequest;
import com.ecom.product.dto.ProductResponse;
import com.ecom.product.dto.ProductUpdateRequest;
import com.ecom.product.model.Products;
import com.ecom.product.repository.ProductRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;


import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * ProductService: business logic for product catalog operations.
 *
 * Handles:
 * - Product CRUD with soft-delete
 * - Ownership/RBAC validation
 * - Event publishing to Kafka
 * - Redis caching for search
 * - Slug generation and uniqueness
 */
@Service
@Transactional
public class ProductService {
    private static final Logger log = LoggerFactory.getLogger(ProductService.class);

    private final ProductRepository productRepository;
    private final KafkaTemplate<String, EventEnvelope> kafkaTemplate;

    public ProductService(ProductRepository productRepository, KafkaTemplate<String, EventEnvelope> kafkaTemplate) {
        this.productRepository = productRepository;
        this.kafkaTemplate = kafkaTemplate;
    }

    private static final String CACHE_PREFIX = "product:";
    private static final long CACHE_TTL = 3600000; // 1 hour in milliseconds

    /**
     * Get product by ID (published only, for public catalog).
     */
    @Transactional(readOnly = true)
    @Cacheable(value = "products", key = "#id + ':public'", unless = "#result == null")
    public ProductResponse getProductPublic(Integer id) {
        Products products = productRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Product not found"));

        if (products.getIsDeleted() || !"PUBLISHED".equals(products.getStatus())) {
            throw new NotFoundException("Product not found");
        }

        return toProductResponse(products);
    }

    /**
     * Get product by ID (any status, for admin/owner).
     */
    @Transactional(readOnly = true)
    public ProductResponse getProduct(Integer id) {
        Products products = productRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Product not found"));

        if (products.getIsDeleted()) {
            throw new NotFoundException("Product not found");
        }

        return toProductResponse(products);
    }

    /**
     * List products with filtering and pagination.
     */
    @Transactional(readOnly = true)
    @Cacheable(value = "products:search", key = "#pageRequest.page + ':' + #pageRequest.limit + ':published'", unless = "#result == null")
    public Page<ProductResponse> listPublishedProducts(PageRequest pageRequest) {
        pageRequest.validate();
        org.springframework.data.domain.Pageable pageable = org.springframework.data.domain.PageRequest.of((pageRequest.getPage() - 1), pageRequest.getLimit());

        org.springframework.data.domain.Page<Products> page = productRepository.findAllPublished(pageable);
        return Page.of(
                page.getContent().stream().map(this::toProductResponse).toList(),
                pageRequest.getPage(),
                pageRequest.getLimit(),
                page.getTotalElements()
        );
    }

    /**
     * Search products by full-text search query.
     */
    @Transactional(readOnly = true)
    @Cacheable(value = "products:fulltext", key = "#query + ':' + #pageRequest.page + ':' + #pageRequest.limit", unless = "#result == null")
    public Page<ProductResponse> searchProducts(String query, PageRequest pageRequest) {
        if (query == null || query.isBlank()) {
            throw new ValidationException("Search query cannot be empty");
        }

        pageRequest.validate();
        String tsQuery = query.replaceAll("[^a-zA-Z0-9 ]", "") + ":*";
        org.springframework.data.domain.Pageable pageable = org.springframework.data.domain.PageRequest.of((pageRequest.getPage() - 1), pageRequest.getLimit());

        org.springframework.data.domain.Page<Products> page = productRepository.findByFullTextSearchPrefix(tsQuery, pageable);
        return Page.of(
                page.getContent().stream().map(this::toProductResponse).toList(),
                pageRequest.getPage(),
                pageRequest.getLimit(),
                page.getTotalElements()
        );
    }

    /**
     * Create a new product (seller/admin only).
     */
    @CacheEvict(value = "products:search", allEntries = true)
    public ProductResponse createProduct(ProductCreateRequest request, String sellerId) {
        // Validation
        if (request.getTitle() == null || request.getTitle().isBlank()) {
            throw new ValidationException("Title is required");
        }

        // Generate slug if not provided
        String slug = request.getSlug();
        if (slug == null || slug.isBlank()) {
            slug = generateSlug(request.getTitle());
        }

        // Check for conflicts
        // ! todo
        // slug check add repo function later
//        if (productRepository.existsBySlug(slug)) {
//            throw new ConflictException("Product with this slug already exists");
//        }

        // Create and persist
        Products products = Products.builder()
                .title(request.getTitle())
                .slug(slug)
                .uniqId(request.getUniqId())
                .productUrl(request.getProductUrl())
                .retailPrice(request.getRetailPrice() != null ? request.getRetailPrice() : BigDecimal.ZERO)
                .discount(request.getDiscount() != null ? request.getDiscount() : BigDecimal.ZERO)
                .imageUrls(request.getImageUrls())
                .description(request.getDescription())
                .category(request.getCategory())
                .subCategory(request.getSubCategory())
                .brand(request.getBrand())
                .brandId(request.getBrandId())
                .manufacturerId(request.getManufacturerId())
                .categoryId(request.getCategoryId())
                .seoTitle(request.getSeoTitle())
                .seoDescription(request.getSeoDescription())
                .canonicalUrl(request.getCanonicalUrl())
                .metaKeywords(request.getMetaKeywords() != null ? request.getMetaKeywords().toArray(new String[0]) : null)
                .attributes(request.getAttributes() != null ? toJsonString(request.getAttributes()) : "{}")
                .status("DRAFT")
                .isDeleted(false)
                .sellerId(sellerId)
                .createdBy(getCurrentUserId())
                .updatedBy(getCurrentUserId())
                .build();

        products = productRepository.save(products);
        products.setCreatedAt(LocalDateTime.now(ZoneId.systemDefault()));
        products.setUpdatedAt(LocalDateTime.now(ZoneId.systemDefault()));

        // Publish event
        publishProductEvent(EventType.PRODUCT_CREATED, products);

        return toProductResponse(products);
    }

    /**
     * Update an existing product (owner/admin only).
     */
    @CacheEvict(value = "products", allEntries = true)
    public ProductResponse updateProduct(Integer id, ProductUpdateRequest request, String userId, String userRole) {
        Products products = productRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Product not found"));

        if (products.getIsDeleted()) {
            throw new NotFoundException("Product not found");
        }

        // RBAC: only owner or admin can update
        if ("SELLER".equals(userRole) && !userId.equals(products.getSellerId())) {
            throw new ForbiddenException("You can only update your own products");
        }

        // Update fields
        if (request.getTitle() != null) {
            products.setTitle(request.getTitle());
        }
        // ! todo
        // write repo method later
//        if (request.getSlug() != null) {
//            if (productRepository.existsBySlug(request.getSlug()) && !request.getSlug().equals(products.getSlug())) {
//                throw new ConflictException("Product with this slug already exists");
//            }
//            products.setSlug(request.getSlug());
//        }
        if (request.getProductUrl() != null) {
            products.setProductUrl(request.getProductUrl());
        }
        if (request.getRetailPrice() != null) {
            products.setRetailPrice(request.getRetailPrice());
        }
        if (request.getDiscount() != null) {
            products.setDiscount(request.getDiscount());
        }
        if (request.getImageUrls() != null) {
            products.setImageUrls(request.getImageUrls());
        }
        if (request.getDescription() != null) {
            products.setDescription(request.getDescription());
        }
        if (request.getCategory() != null) {
            products.setCategory(request.getCategory());
        }
        if (request.getSubCategory() != null) {
            products.setSubCategory(request.getSubCategory());
        }
        if (request.getBrand() != null) {
            products.setBrand(request.getBrand());
        }
        if (request.getBrandId() != null) {
            products.setBrandId(request.getBrandId());
        }
        if (request.getManufacturerId() != null) {
            products.setManufacturerId(request.getManufacturerId());
        }
        if (request.getCategoryId() != null) {
            products.setCategoryId(request.getCategoryId());
        }
        if (request.getSeoTitle() != null) {
            products.setSeoTitle(request.getSeoTitle());
        }
        if (request.getSeoDescription() != null) {
            products.setSeoDescription(request.getSeoDescription());
        }
        if (request.getCanonicalUrl() != null) {
            products.setCanonicalUrl(request.getCanonicalUrl());
        }
        if (request.getMetaKeywords() != null) {
            products.setMetaKeywords(request.getMetaKeywords().toArray(new String[0]));
        }
        if (request.getAttributes() != null) {
            products.setAttributes(toJsonString(request.getAttributes()));
        }

        products.setUpdatedBy(userId);
        products.setVersion(products.getVersion() + 1);
        products = productRepository.save(products);

        // Publish event
        publishProductEvent(EventType.PRODUCT_UPDATED, products);

        return toProductResponse(products);
    }

    /**
     * Soft-delete a product (admin/owner only).
     */
    @CacheEvict(value = "products", allEntries = true)
    public void deleteProduct(Integer id, String userId, String userRole) {
        Products products = productRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Product not found"));

        if (products.getIsDeleted()) {
            throw new NotFoundException("Product not found");
        }

        // RBAC
        if ("SELLER".equals(userRole) && !userId.equals(products.getSellerId())) {
            throw new ForbiddenException("You can only delete your own products");
        }

        products.setIsDeleted(true);
        products.setDeletedAt(LocalDateTime.now(ZoneId.systemDefault()));
        products.setDeletedBy(userId);
        products.setVersion(products.getVersion() + 1);
        productRepository.save(products);

        // Publish event
        publishProductEvent(EventType.PRODUCT_DELETED, products);
    }

    /**
     * Restore a soft-deleted product (admin only).
     */
    @CacheEvict(value = "products", allEntries = true)
    public ProductResponse restoreProduct(Integer id) {
        Products products = productRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Product not found"));

        if (!products.getIsDeleted()) {
            throw new ConflictException("Product is not deleted");
        }

        products.setIsDeleted(false);
        products.setDeletedAt(null);
        products.setDeletedBy(null);
        products.setVersion(products.getVersion() + 1);
        products.setUpdatedBy(getCurrentUserId());
        productRepository.save(products);

        return toProductResponse(products);
    }

    // Helper methods

    private String generateSlug(String title) {
        return title.toLowerCase()
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-+|-+$", "");
    }

    private String toJsonString(Map<String, Object> map) {
        try {
            return map != null ? map.toString() : "{}";
        } catch (Exception e) {
            return "{}";
        }
    }

    private ProductResponse toProductResponse(Products products) {
        return ProductResponse.builder()
                .id(products.getId())
                .uniqId(products.getUniqId())
                .title(products.getTitle())
                .slug(products.getSlug())
                .productUrl(products.getProductUrl())
                .retailPrice(products.getRetailPrice())
                .discount(products.getDiscount())
                .imageUrls(products.getImageUrls())
                .description(products.getDescription())
                .category(products.getCategory())
                .subCategory(products.getSubCategory())
                .brand(products.getBrand())
                .rating(products.getRating())
                .reviewCount(products.getReviewCount())
                .sellerId(products.getSellerId())
                .brandId(products.getBrandId())
                .manufacturerId(products.getManufacturerId())
                .categoryId(products.getCategoryId())
                .status(products.getStatus())
                .seoTitle(products.getSeoTitle())
                .seoDescription(products.getSeoDescription())
                .canonicalUrl(products.getCanonicalUrl())
                .metaKeywords(products.getMetaKeywords() != null ? java.util.Arrays.asList(products.getMetaKeywords()) : null)
                .attributes(products.getAttributes() != null ? parseJsonToMap(products.getAttributes()) : null)
                .createdAt(products.getCreatedAt())
                .updatedAt(products.getUpdatedAt())
                .build();
    }

    private Map<String, Object> parseJsonToMap(String json) {
        // Simple parsing - in production, use Jackson ObjectMapper
        return new HashMap<>();
    }

    private void publishProductEvent(String eventType, Products products) {
        try {
            Map<String, Object> payload = new HashMap<>();
            payload.put("product_id", products.getId());
            payload.put("title", products.getTitle());
            payload.put("slug", products.getSlug());
            payload.put("description", products.getDescription());
            payload.put("brand", products.getBrand());
            payload.put("category", products.getCategory());
            payload.put("sub_category", products.getSubCategory());
            payload.put("retail_price", products.getRetailPrice().toString());
            payload.put("discount", products.getDiscount().toString());
            payload.put("rating", products.getRating().toString());
            payload.put("review_count", products.getReviewCount());
            payload.put("image_urls", products.getImageUrls());
            payload.put("brand_id", products.getBrandId());
            payload.put("category_id", products.getCategoryId());
            payload.put("manufacturer_id", products.getManufacturerId());
            payload.put("status", products.getStatus());

            EventEnvelope event = new EventEnvelope();
            event.setEventId(UUID.randomUUID().toString());
            event.setEventType(eventType);
            event.setEventVersion(1);
            event.setOccurredAt(Instant.now());
            event.setProducer("product-service");
            event.setPartitionKey(products.getId().toString());
            event.setPayload(payload);

            kafkaTemplate.send(Topics.PRODUCT, products.getId().toString(), event);
            log.debug("Published {} event for product {}", eventType, products.getId());
        } catch (Exception e) {
            // Don't fail writes if Kafka is down
            log.warn("Failed to publish event for product {}: {}", products.getId(), e.getMessage());
        }
    }

    private String getCurrentUserId() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }
}
