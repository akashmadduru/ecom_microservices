package com.ecom.product.seeder;

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
public class SeederProperties {
    private boolean enabled = false;
    private String csvDir = "data/csv";

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getCsvDir() {
        return csvDir;
    }

    public void setCsvDir(String csvDir) {
        this.csvDir = csvDir;
    }
}
