package com.ecom.inventory;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * InventoryServiceApplication: Spring Boot entry point for Inventory Service.
 * Manages stock levels, reservations, and audit trail.
 */
@SpringBootApplication
public class InventoryServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(InventoryServiceApplication.class, args);
    }
}
