package com.ecom.product.seeder;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * SeederRunner: Runs CSV data seeding on application startup.
 *
 * Enabled via: app.seeding.enabled=true (default: false)
 * CSV path via: app.seeding.csv-dir=/path/to/csv (default: data/csv)
 */
@Component
@ConditionalOnProperty(name = "app.seeding.enabled", havingValue = "true", matchIfMissing = false)
@RequiredArgsConstructor
@Slf4j
public class SeederRunner implements CommandLineRunner {
    private final CsvDataSeeder csvDataSeeder;
    private final SeederProperties seederProperties;

    @Override
    public void run(String... args) throws Exception {
        log.info("Starting CSV data seeding");
        long startTime = System.currentTimeMillis();

        try {
            csvDataSeeder.seedFromDirectory(seederProperties.getCsvDir());
            long duration = System.currentTimeMillis() - startTime;
            log.info("CSV seeding completed in {} ms", duration);
        } catch (Exception e) {
            log.error("CSV seeding failed", e);
            // Don't fail startup if seeding fails
        }
    }
}
