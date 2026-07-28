package com.ecom.product.controller;

import com.ecom.product.dto.BrandResponse;
import com.ecom.product.dto.CategoryResponse;
import com.ecom.product.dto.CollectionResponse;
import com.ecom.product.dto.ManufacturerResponse;
import com.ecom.product.dto.TagResponse;
import com.ecom.product.model.Brand;
import com.ecom.product.model.Category;
import com.ecom.product.model.Collection;
import com.ecom.product.model.Manufacturer;
import com.ecom.product.model.Tag;
import com.ecom.product.repository.BrandRepository;
import com.ecom.product.repository.CategoryRepository;
import com.ecom.product.repository.CollectionRepository;
import com.ecom.product.repository.ManufacturerRepository;
import com.ecom.product.repository.TagRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * CatalogController: REST endpoints for browsing product catalog taxonomy.
 *
 * Provides access to brands, categories, manufacturers, collections, and tags.
 * Public endpoints (no authentication required).
 */
@RestController
@RequestMapping("/api/v1/catalog")
public class CatalogController {
    private static final Logger log = LoggerFactory.getLogger(CatalogController.class);
    private final BrandRepository brandRepository;
    private final CategoryRepository categoryRepository;
    private final ManufacturerRepository manufacturerRepository;
    private final CollectionRepository collectionRepository;
    private final TagRepository tagRepository;

    public CatalogController(BrandRepository brandRepository, CategoryRepository categoryRepository,
                           ManufacturerRepository manufacturerRepository, CollectionRepository collectionRepository,
                           TagRepository tagRepository) {
        this.brandRepository = brandRepository;
        this.categoryRepository = categoryRepository;
        this.manufacturerRepository = manufacturerRepository;
        this.collectionRepository = collectionRepository;
        this.tagRepository = tagRepository;
    }

    /**
     * GET /catalog/brands - List active brands.
     */
    @GetMapping("/brands")
    public ResponseEntity<List<BrandResponse>> listBrands() {
        log.info("Listing brands");
        List<BrandResponse> brands = brandRepository.findAllActive(null)
                .map(this::toBrandResponse)
                .stream()
                .toList();
        return ResponseEntity.ok(brands);
    }

    /**
     * GET /catalog/brands/{id} - Get brand details.
     */
    @GetMapping("/brands/{id}")
    public ResponseEntity<BrandResponse> getBrand(@PathVariable Integer id) {
        log.info("Getting brand: id={}", id);
        Brand brand = brandRepository.findById(id)
                .orElseThrow(() -> new com.ecom.common.exception.NotFoundException("Brand not found"));
        return ResponseEntity.ok(toBrandResponse(brand));
    }

    /**
     * GET /catalog/categories - List categories (optionally filtered by parent).
     */
    @GetMapping("/categories")
    public ResponseEntity<List<CategoryResponse>> listCategories(
            @RequestParam(required = false) Integer parentId) {
        log.info("Listing categories: parentId={}", parentId);
        List<CategoryResponse> categories = categoryRepository.findChildrenOf(parentId)
                .stream()
                .map(this::toCategoryResponse)
                .toList();
        return ResponseEntity.ok(categories);
    }

    /**
     * GET /catalog/categories/{id} - Get category details.
     */
    @GetMapping("/categories/{id}")
    public ResponseEntity<CategoryResponse> getCategory(@PathVariable Integer id) {
        log.info("Getting category: id={}", id);
        Category category = categoryRepository.findById(id)
                .orElseThrow(() -> new com.ecom.common.exception.NotFoundException("Category not found"));
        return ResponseEntity.ok(toCategoryResponse(category));
    }

    /**
     * GET /catalog/categories/{id}/subtree - Get category subtree.
     */
    @GetMapping("/categories/{id}/subtree")
    public ResponseEntity<List<CategoryResponse>> getCategorySubtree(@PathVariable Integer id) {
        log.info("Getting category subtree: id={}", id);
        Category category = categoryRepository.findById(id)
                .orElseThrow(() -> new com.ecom.common.exception.NotFoundException("Category not found"));
        List<CategoryResponse> subtree = categoryRepository.findSubtree(category.getPath())
                .stream()
                .map(this::toCategoryResponse)
                .toList();
        return ResponseEntity.ok(subtree);
    }

    /**
     * GET /catalog/manufacturers - List manufacturers.
     */
    @GetMapping("/manufacturers")
    public ResponseEntity<List<ManufacturerResponse>> listManufacturers() {
        log.info("Listing manufacturers");
        List<ManufacturerResponse> manufacturers = manufacturerRepository.findAll()
                .stream()
                .map(this::toManufacturerResponse)
                .toList();
        return ResponseEntity.ok(manufacturers);
    }

    /**
     * GET /catalog/manufacturers/{id} - Get manufacturer details.
     */
    @GetMapping("/manufacturers/{id}")
    public ResponseEntity<ManufacturerResponse> getManufacturer(@PathVariable Integer id) {
        log.info("Getting manufacturer: id={}", id);
        Manufacturer manufacturer = manufacturerRepository.findById(id)
                .orElseThrow(() -> new com.ecom.common.exception.NotFoundException("Manufacturer not found"));
        return ResponseEntity.ok(toManufacturerResponse(manufacturer));
    }

    /**
     * GET /catalog/collections - List active collections.
     */
    @GetMapping("/collections")
    public ResponseEntity<List<CollectionResponse>> listCollections() {
        log.info("Listing collections");
        List<CollectionResponse> collections = collectionRepository.findAllActive(null)
                .map(this::toCollectionResponse)
                .stream()
                .toList();
        return ResponseEntity.ok(collections);
    }

    /**
     * GET /catalog/tags - List tags.
     */
    @GetMapping("/tags")
    public ResponseEntity<List<TagResponse>> listTags() {
        log.info("Listing tags");
        List<TagResponse> tags = tagRepository.findAll()
                .stream()
                .map(this::toTagResponse)
                .toList();
        return ResponseEntity.ok(tags);
    }

    // DTOs conversion helpers
    private BrandResponse toBrandResponse(Brand brand) {
        return new BrandResponse(
                brand.getId(),
                brand.getName(),
                brand.getSlug(),
                brand.getLogoUrl(),
                brand.getManufacturerId(),
                brand.getDescription(),
                brand.getIsActive()
        );
    }

    private CategoryResponse toCategoryResponse(Category category) {
        return new CategoryResponse(
                category.getId(),
                category.getParentId(),
                category.getName(),
                category.getSlug(),
                category.getPath(),
                category.getDepth(),
                category.getIsActive(),
                category.getSortOrder()
        );
    }

    private ManufacturerResponse toManufacturerResponse(Manufacturer manufacturer) {
        return new ManufacturerResponse(
                manufacturer.getId(),
                manufacturer.getName(),
                manufacturer.getCountryOfOrigin(),
                null
        );
    }

    private CollectionResponse toCollectionResponse(Collection collection) {
        return new CollectionResponse(
                collection.getId(),
                collection.getName(),
                collection.getSlug(),
                collection.getDescription(),
                collection.getIsActive(),
                collection.getStartsAt(),
                collection.getEndsAt()
        );
    }

    private TagResponse toTagResponse(Tag tag) {
        return new TagResponse(
                tag.getId(),
                tag.getName(),
                tag.getSlug()
        );
    }
}
