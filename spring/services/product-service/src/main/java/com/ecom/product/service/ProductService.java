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
import com.ecom.product.model.Product;
import com.ecom.product.repository.ProductRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
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
@Slf4j
@RequiredArgsConstructor
public class ProductService {

    private final ProductRepository productRepository;
    private final KafkaTemplate<String, EventEnvelope> kafkaTemplate;

    private static final String CACHE_PREFIX = "product:";
    private static final long CACHE_TTL = 3600000; // 1 hour in milliseconds

    /**
     * Get product by ID (published only, for public catalog).
     */
    @Transactional(readOnly = true)
    @Cacheable(value = "products", key = "#id + ':public'", unless = "#result == null")
    public ProductResponse getProductPublic(Integer id) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Product not found"));

        if (product.getIsDeleted() || !"PUBLISHED".equals(product.getStatus())) {
            throw new NotFoundException("Product not found");
        }

        return toProductResponse(product);
    }

    /**
     * Get product by ID (any status, for admin/owner).
     */
    @Transactional(readOnly = true)
    public ProductResponse getProduct(Integer id) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Product not found"));

        if (product.getIsDeleted()) {
            throw new NotFoundException("Product not found");
        }

        return toProductResponse(product);
    }

    /**
     * List products with filtering and pagination.
     */
    @Transactional(readOnly = true)
    @Cacheable(value = "products:search", key = "#pageRequest.page + ':' + #pageRequest.limit + ':published'", unless = "#result == null")
    public Page<ProductResponse> listPublishedProducts(PageRequest pageRequest) {
        pageRequest.validate();
        org.springframework.data.domain.Pageable pageable = of((pageRequest.getPage() - 1), pageRequest.getLimit());

        org.springframework.data.domain.Page<Product> page = productRepository.findAllPublished(pageable);
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
        org.springframework.data.domain.Pageable pageable = of((pageRequest.getPage() - 1), pageRequest.getLimit());

        org.springframework.data.domain.Page<Product> page = productRepository.findByFullTextSearchPrefix(tsQuery, pageable);
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
        if (productRepository.existsBySlug(slug)) {
            throw new ConflictException("Product with this slug already exists");
        }

        // Create and persist
        Product product = Product.builder()
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

        product = productRepository.save(product);
        product.setCreatedAt(LocalDateTime.now(ZoneId.systemDefault()));
        product.setUpdatedAt(LocalDateTime.now(ZoneId.systemDefault()));

        // Publish event
        publishProductEvent(EventType.PRODUCT_CREATED, product);

        return toProductResponse(product);
    }

    /**
     * Update an existing product (owner/admin only).
     */
    @CacheEvict(value = "products", allEntries = true)
    public ProductResponse updateProduct(Integer id, ProductUpdateRequest request, String userId, String userRole) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Product not found"));

        if (product.getIsDeleted()) {
            throw new NotFoundException("Product not found");
        }

        // RBAC: only owner or admin can update
        if ("SELLER".equals(userRole) && !userId.equals(product.getSellerId())) {
            throw new ForbiddenException("You can only update your own products");
        }

        // Update fields
        if (request.getTitle() != null) {
            product.setTitle(request.getTitle());
        }
        if (request.getSlug() != null) {
            if (productRepository.existsBySlug(request.getSlug()) && !request.getSlug().equals(product.getSlug())) {
                throw new ConflictException("Product with this slug already exists");
            }
            product.setSlug(request.getSlug());
        }
        if (request.getProductUrl() != null) {
            product.setProductUrl(request.getProductUrl());
        }
        if (request.getRetailPrice() != null) {
            product.setRetailPrice(request.getRetailPrice());
        }
        if (request.getDiscount() != null) {
            product.setDiscount(request.getDiscount());
        }
        if (request.getImageUrls() != null) {
            product.setImageUrls(request.getImageUrls());
        }
        if (request.getDescription() != null) {
            product.setDescription(request.getDescription());
        }
        if (request.getCategory() != null) {
            product.setCategory(request.getCategory());
        }
        if (request.getSubCategory() != null) {
            product.setSubCategory(request.getSubCategory());
        }
        if (request.getBrand() != null) {
            product.setBrand(request.getBrand());
        }
        if (request.getBrandId() != null) {
            product.setBrandId(request.getBrandId());
        }
        if (request.getManufacturerId() != null) {
            product.setManufacturerId(request.getManufacturerId());
        }
        if (request.getCategoryId() != null) {
            product.setCategoryId(request.getCategoryId());
        }
        if (request.getSeoTitle() != null) {
            product.setSeoTitle(request.getSeoTitle());
        }
        if (request.getSeoDescription() != null) {
            product.setSeoDescription(request.getSeoDescription());
        }
        if (request.getCanonicalUrl() != null) {
            product.setCanonicalUrl(request.getCanonicalUrl());
        }
        if (request.getMetaKeywords() != null) {
            product.setMetaKeywords(request.getMetaKeywords().toArray(new String[0]));
        }
        if (request.getAttributes() != null) {
            product.setAttributes(toJsonString(request.getAttributes()));
        }

        product.setUpdatedBy(userId);
        product.setVersion(product.getVersion() + 1);
        product = productRepository.save(product);

        // Publish event
        publishProductEvent(EventType.PRODUCT_UPDATED, product);

        return toProductResponse(product);
    }

    /**
     * Soft-delete a product (admin/owner only).
     */
    @CacheEvict(value = "products", allEntries = true)
    public void deleteProduct(Integer id, String userId, String userRole) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Product not found"));

        if (product.getIsDeleted()) {
            throw new NotFoundException("Product not found");
        }

        // RBAC
        if ("SELLER".equals(userRole) && !userId.equals(product.getSellerId())) {
            throw new ForbiddenException("You can only delete your own products");
        }

        product.setIsDeleted(true);
        product.setDeletedAt(LocalDateTime.now(ZoneId.systemDefault()));
        product.setDeletedBy(userId);
        product.setVersion(product.getVersion() + 1);
        productRepository.save(product);

        // Publish event
        publishProductEvent(EventType.PRODUCT_DELETED, product);
    }

    /**
     * Restore a soft-deleted product (admin only).
     */
    @CacheEvict(value = "products", allEntries = true)
    public ProductResponse restoreProduct(Integer id) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Product not found"));

        if (!product.getIsDeleted()) {
            throw new ConflictException("Product is not deleted");
        }

        product.setIsDeleted(false);
        product.setDeletedAt(null);
        product.setDeletedBy(null);
        product.setVersion(product.getVersion() + 1);
        product.setUpdatedBy(getCurrentUserId());
        productRepository.save(product);

        return toProductResponse(product);
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

    private ProductResponse toProductResponse(Product product) {
        return ProductResponse.builder()
                .id(product.getId())
                .uniqId(product.getUniqId())
                .title(product.getTitle())
                .slug(product.getSlug())
                .productUrl(product.getProductUrl())
                .retailPrice(product.getRetailPrice())
                .discount(product.getDiscount())
                .imageUrls(product.getImageUrls())
                .description(product.getDescription())
                .category(product.getCategory())
                .subCategory(product.getSubCategory())
                .brand(product.getBrand())
                .rating(product.getRating())
                .reviewCount(product.getReviewCount())
                .sellerId(product.getSellerId())
                .brandId(product.getBrandId())
                .manufacturerId(product.getManufacturerId())
                .categoryId(product.getCategoryId())
                .status(product.getStatus())
                .seoTitle(product.getSeoTitle())
                .seoDescription(product.getSeoDescription())
                .canonicalUrl(product.getCanonicalUrl())
                .metaKeywords(product.getMetaKeywords() != null ? java.util.Arrays.asList(product.getMetaKeywords()) : null)
                .attributes(product.getAttributes() != null ? parseJsonToMap(product.getAttributes()) : null)
                .createdAt(product.getCreatedAt())
                .updatedAt(product.getUpdatedAt())
                .build();
    }

    private Map<String, Object> parseJsonToMap(String json) {
        // Simple parsing - in production, use Jackson ObjectMapper
        return new HashMap<>();
    }

    private void publishProductEvent(String eventType, Product product) {
        try {
            Map<String, Object> payload = new HashMap<>();
            payload.put("product_id", product.getId());
            payload.put("title", product.getTitle());
            payload.put("slug", product.getSlug());
            payload.put("description", product.getDescription());
            payload.put("brand", product.getBrand());
            payload.put("category", product.getCategory());
            payload.put("sub_category", product.getSubCategory());
            payload.put("retail_price", product.getRetailPrice().toString());
            payload.put("discount", product.getDiscount().toString());
            payload.put("rating", product.getRating().toString());
            payload.put("review_count", product.getReviewCount());
            payload.put("image_urls", product.getImageUrls());
            payload.put("brand_id", product.getBrandId());
            payload.put("category_id", product.getCategoryId());
            payload.put("manufacturer_id", product.getManufacturerId());
            payload.put("status", product.getStatus());

            EventEnvelope event = new EventEnvelope();
            event.setEventId(UUID.randomUUID().toString());
            event.setEventType(eventType);
            event.setEventVersion(1);
            event.setOccurredAt(Instant.now());
            event.setProducer("product-service");
            event.setPartitionKey(product.getId().toString());
            event.setPayload(payload);

            kafkaTemplate.send(Topics.PRODUCT, product.getId().toString(), event);
            log.debug("Published {} event for product {}", eventType, product.getId());
        } catch (Exception e) {
            // Don't fail writes if Kafka is down
            log.warn("Failed to publish event for product {}: {}", product.getId(), e.getMessage());
        }
    }

    private String getCurrentUserId() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }
}
