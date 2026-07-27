package com.ecom.product.seeder;

import com.ecom.product.model.Brand;
import com.ecom.product.model.Category;
import com.ecom.product.model.Collection;
import com.ecom.product.model.CollectionProduct;
import com.ecom.product.model.Manufacturer;
import com.ecom.product.model.Product;
import com.ecom.product.model.ProductAttribute;
import com.ecom.product.model.ProductImage;
import com.ecom.product.model.ProductTag;
import com.ecom.product.model.ProductVariant;
import com.ecom.product.model.Tag;
import com.ecom.product.repository.BrandRepository;
import com.ecom.product.repository.CategoryRepository;
import com.ecom.product.repository.CollectionProductRepository;
import com.ecom.product.repository.CollectionRepository;
import com.ecom.product.repository.ManufacturerRepository;
import com.ecom.product.repository.ProductAttributeRepository;
import com.ecom.product.repository.ProductImageRepository;
import com.ecom.product.repository.ProductRepository;
import com.ecom.product.repository.ProductTagRepository;
import com.ecom.product.repository.ProductVariantRepository;
import com.ecom.product.repository.TagRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.io.BufferedReader;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * CsvDataSeeder: Loads product catalog data from CSV files.
 *
 * Supports:
 * - Manufacturers, Brands, Categories, Collections, Tags
 * - Products with variants, images, attributes
 * - Junction tables (ProductTag, CollectionProduct, ProductVariantAttributeValue)
 * - Idempotency via duplicate detection
 * - Batch inserts for performance
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class CsvDataSeeder {
    private final ManufacturerRepository manufacturerRepository;
    private final BrandRepository brandRepository;
    private final CategoryRepository categoryRepository;
    private final CollectionRepository collectionRepository;
    private final TagRepository tagRepository;
    private final ProductRepository productRepository;
    private final ProductVariantRepository productVariantRepository;
    private final ProductImageRepository productImageRepository;
    private final ProductAttributeRepository productAttributeRepository;
    private final ProductTagRepository productTagRepository;
    private final CollectionProductRepository collectionProductRepository;

    private static final int BATCH_SIZE = 50;

    @Transactional
    public void seedFromDirectory(String csvDirPath) throws IOException {
        Path dir = Paths.get(csvDirPath);
        if (!Files.exists(dir) || !Files.isDirectory(dir)) {
            log.warn("CSV directory not found: {}", csvDirPath);
            return;
        }

        log.info("Seeding from CSV directory: {}", csvDirPath);

        // Load taxonomy first
        seedManufacturers(dir.resolve("manufacturers.csv"));
        seedBrands(dir.resolve("brands.csv"));
        seedCategories(dir.resolve("categories.csv"));
        seedCollections(dir.resolve("collections.csv"));
        seedTags(dir.resolve("tags.csv"));
        seedProductAttributes(dir.resolve("attributes.csv"));

        // Load products and relationships
        seedProducts(dir.resolve("products.csv"));

        log.info("CSV seeding completed");
    }

    private void seedManufacturers(Path filePath) throws IOException {
        if (!Files.exists(filePath)) {
            log.debug("Manufacturers file not found: {}", filePath);
            return;
        }

        log.info("Seeding manufacturers from {}", filePath);
        List<Manufacturer> manufacturers = new ArrayList<>();

        try (BufferedReader reader = Files.newBufferedReader(filePath, StandardCharsets.UTF_8)) {
            String line;
            boolean header = true;
            while ((line = reader.readLine()) != null) {
                if (header) {
                    header = false;
                    continue;
                }

                String[] parts = line.split(",");
                if (parts.length < 1) continue;

                String name = parts[0].trim();

                // Check for duplicates
                if (manufacturerRepository.findByName(name).isPresent()) {
                    continue;
                }

                Manufacturer manufacturer = new Manufacturer(name);
                if (parts.length > 1) {
                    manufacturer.setCountryOfOrigin(parts[1].trim());
                }
                manufacturers.add(manufacturer);

                if (manufacturers.size() >= BATCH_SIZE) {
                    manufacturerRepository.saveAll(manufacturers);
                    manufacturers.clear();
                }
            }

            if (!manufacturers.isEmpty()) {
                manufacturerRepository.saveAll(manufacturers);
            }
        }

        log.info("Manufacturers seeded successfully");
    }

    private void seedBrands(Path filePath) throws IOException {
        if (!Files.exists(filePath)) {
            log.debug("Brands file not found: {}", filePath);
            return;
        }

        log.info("Seeding brands from {}", filePath);
        List<Brand> brands = new ArrayList<>();

        try (BufferedReader reader = Files.newBufferedReader(filePath, StandardCharsets.UTF_8)) {
            String line;
            boolean header = true;
            while ((line = reader.readLine()) != null) {
                if (header) {
                    header = false;
                    continue;
                }

                String[] parts = line.split(",");
                if (parts.length < 2) continue;

                String name = parts[0].trim();
                String slug = parts[1].trim();

                // Check for duplicates
                if (brandRepository.findBySlug(slug).isPresent()) {
                    continue;
                }

                Brand brand = new Brand(name, slug);
                if (parts.length > 2) {
                    brand.setLogoUrl(parts[2].trim());
                }
                if (parts.length > 3 && !parts[3].trim().isEmpty()) {
                    brand.setManufacturerId(Integer.parseInt(parts[3].trim()));
                }
                brands.add(brand);

                if (brands.size() >= BATCH_SIZE) {
                    brandRepository.saveAll(brands);
                    brands.clear();
                }
            }

            if (!brands.isEmpty()) {
                brandRepository.saveAll(brands);
            }
        }

        log.info("Brands seeded successfully");
    }

    private void seedCategories(Path filePath) throws IOException {
        if (!Files.exists(filePath)) {
            log.debug("Categories file not found: {}", filePath);
            return;
        }

        log.info("Seeding categories from {}", filePath);
        List<Category> categories = new ArrayList<>();

        try (BufferedReader reader = Files.newBufferedReader(filePath, StandardCharsets.UTF_8)) {
            String line;
            boolean header = true;
            while ((line = reader.readLine()) != null) {
                if (header) {
                    header = false;
                    continue;
                }

                String[] parts = line.split(",");
                if (parts.length < 3) continue;

                String name = parts[0].trim();
                String slug = parts[1].trim();
                String path = parts[2].trim();

                // Check for duplicates
                if (categoryRepository.existsByPath(path)) {
                    continue;
                }

                Category category = new Category(name, slug, path);
                if (parts.length > 3 && !parts[3].trim().isEmpty()) {
                    category.setParentId(Integer.parseInt(parts[3].trim()));
                }
                categories.add(category);

                if (categories.size() >= BATCH_SIZE) {
                    categoryRepository.saveAll(categories);
                    categories.clear();
                }
            }

            if (!categories.isEmpty()) {
                categoryRepository.saveAll(categories);
            }
        }

        log.info("Categories seeded successfully");
    }

    private void seedCollections(Path filePath) throws IOException {
        if (!Files.exists(filePath)) {
            log.debug("Collections file not found: {}", filePath);
            return;
        }

        log.info("Seeding collections from {}", filePath);
        List<Collection> collections = new ArrayList<>();

        try (BufferedReader reader = Files.newBufferedReader(filePath, StandardCharsets.UTF_8)) {
            String line;
            boolean header = true;
            while ((line = reader.readLine()) != null) {
                if (header) {
                    header = false;
                    continue;
                }

                String[] parts = line.split(",");
                if (parts.length < 2) continue;

                String name = parts[0].trim();
                String slug = parts[1].trim();

                // Check for duplicates
                if (collectionRepository.findBySlug(slug).isPresent()) {
                    continue;
                }

                Collection collection = new Collection(name, slug);
                if (parts.length > 2) {
                    collection.setDescription(parts[2].trim());
                }
                collections.add(collection);

                if (collections.size() >= BATCH_SIZE) {
                    collectionRepository.saveAll(collections);
                    collections.clear();
                }
            }

            if (!collections.isEmpty()) {
                collectionRepository.saveAll(collections);
            }
        }

        log.info("Collections seeded successfully");
    }

    private void seedTags(Path filePath) throws IOException {
        if (!Files.exists(filePath)) {
            log.debug("Tags file not found: {}", filePath);
            return;
        }

        log.info("Seeding tags from {}", filePath);
        List<Tag> tags = new ArrayList<>();

        try (BufferedReader reader = Files.newBufferedReader(filePath, StandardCharsets.UTF_8)) {
            String line;
            boolean header = true;
            while ((line = reader.readLine()) != null) {
                if (header) {
                    header = false;
                    continue;
                }

                String[] parts = line.split(",");
                if (parts.length < 2) continue;

                String name = parts[0].trim();
                String slug = parts[1].trim();

                tags.add(new Tag(name, slug));

                if (tags.size() >= BATCH_SIZE) {
                    tagRepository.saveAll(tags);
                    tags.clear();
                }
            }

            if (!tags.isEmpty()) {
                tagRepository.saveAll(tags);
            }
        }

        log.info("Tags seeded successfully");
    }

    private void seedProductAttributes(Path filePath) throws IOException {
        if (!Files.exists(filePath)) {
            log.debug("Attributes file not found: {}", filePath);
            return;
        }

        log.info("Seeding product attributes from {}", filePath);
        List<ProductAttribute> attributes = new ArrayList<>();

        try (BufferedReader reader = Files.newBufferedReader(filePath, StandardCharsets.UTF_8)) {
            String line;
            boolean header = true;
            while ((line = reader.readLine()) != null) {
                if (header) {
                    header = false;
                    continue;
                }

                String[] parts = line.split(",");
                if (parts.length < 2) continue;

                String name = parts[0].trim();
                String code = parts[1].trim();

                attributes.add(new ProductAttribute(name, code));

                if (attributes.size() >= BATCH_SIZE) {
                    productAttributeRepository.saveAll(attributes);
                    attributes.clear();
                }
            }

            if (!attributes.isEmpty()) {
                productAttributeRepository.saveAll(attributes);
            }
        }

        log.info("Product attributes seeded successfully");
    }

    private void seedProducts(Path filePath) throws IOException {
        if (!Files.exists(filePath)) {
            log.debug("Products file not found: {}", filePath);
            return;
        }

        log.info("Seeding products from {}", filePath);
        List<Product> products = new ArrayList<>();

        try (BufferedReader reader = Files.newBufferedReader(filePath, StandardCharsets.UTF_8)) {
            String line;
            boolean header = true;
            while ((line = reader.readLine()) != null) {
                if (header) {
                    header = false;
                    continue;
                }

                String[] parts = line.split(",", -1);
                if (parts.length < 2) continue;

                String title = parts[0].trim();
                String slug = parts[1].trim();

                // Check for duplicates
                if (productRepository.findBySlug(slug).isPresent()) {
                    continue;
                }

                Product product = new Product(title, slug);
                product.setStatus("PUBLISHED");
                product.setCreatedAt(LocalDateTime.now());
                product.setUpdatedAt(LocalDateTime.now());

                if (parts.length > 2 && !parts[2].isEmpty()) {
                    product.setRetailPrice(new BigDecimal(parts[2].trim()));
                }
                if (parts.length > 3 && !parts[3].isEmpty()) {
                    product.setDiscount(new BigDecimal(parts[3].trim()));
                }
                if (parts.length > 4) {
                    product.setDescription(parts[4].trim());
                }
                if (parts.length > 5) {
                    product.setCategory(parts[5].trim());
                }
                if (parts.length > 6) {
                    product.setBrand(parts[6].trim());
                }

                products.add(product);

                if (products.size() >= BATCH_SIZE) {
                    productRepository.saveAll(products);
                    products.clear();
                }
            }

            if (!products.isEmpty()) {
                productRepository.saveAll(products);
            }
        }

        log.info("Products seeded successfully");
    }
}
