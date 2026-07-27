package com.ecom.product.seeder;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * SeederProperties: Configuration for CSV seeding.
 *
 * Usage:
 *   app.seeding.enabled=true
 *   app.seeding.csv-dir=/data/csv
 */
@Component
@ConfigurationProperties(prefix = "app.seeding")
@Getter
@Setter
public class SeederProperties {
    private boolean enabled = false;
    private String csvDir = "data/csv";
}
