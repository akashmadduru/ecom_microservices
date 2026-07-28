package com.ecom.product.seeder;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
public class SeederRunner implements CommandLineRunner {
    private static final Logger log = LoggerFactory.getLogger(SeederRunner.class);
    private final CsvDataSeeder csvDataSeeder;
    private final SeederProperties seederProperties;

    public SeederRunner(CsvDataSeeder csvDataSeeder, SeederProperties seederProperties) {
        this.csvDataSeeder = csvDataSeeder;
        this.seederProperties = seederProperties;
    }

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
