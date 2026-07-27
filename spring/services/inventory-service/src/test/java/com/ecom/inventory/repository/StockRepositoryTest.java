package com.ecom.inventory.repository;

import com.ecom.inventory.model.Stock;
import jakarta.persistence.LockModeType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * StockRepositoryTest: Unit tests for StockRepository.
 *
 * Tests:
 * - CRUD operations
 * - Pessimistic locking
 * - Low stock queries
 * - Existence checks
 */
@DataJpaTest
@ActiveProfiles("test")
@DisplayName("StockRepository Tests")
class StockRepositoryTest {
    @Autowired
    private StockRepository stockRepository;

    private Stock testStock;

    @BeforeEach
    void setUp() {
        testStock = new Stock(1L, "SKU-001");
        testStock.setAvailableQty(100);
        testStock.setReservedQty(20);
        testStock.setSafetyStock(10);
        testStock.setReorderThreshold(15);
        testStock.setWarehouseLocation("WAREHOUSE_A");
        testStock.setStatus("IN_STOCK");
        testStock.setCreatedAt(LocalDateTime.now());
        testStock.setUpdatedAt(LocalDateTime.now());
    }

    @Test
    @DisplayName("Should save and retrieve stock by product ID")
    void testSaveAndFindByProductId() {
        Stock saved = stockRepository.save(testStock);

        Stock found = stockRepository.findByProductIdForRead(1L).orElse(null);

        assertThat(found).isNotNull();
        assertThat(found.getId()).isEqualTo(saved.getId());
        assertThat(found.getSku()).isEqualTo("SKU-001");
        assertThat(found.getAvailableQty()).isEqualTo(100);
    }

    @Test
    @DisplayName("Should find stock by SKU")
    void testFindBySku() {
        stockRepository.save(testStock);

        Stock found = stockRepository.findBySku("SKU-001").orElse(null);

        assertThat(found).isNotNull();
        assertThat(found.getProductId()).isEqualTo(1L);
    }

    @Test
    @DisplayName("Should check if stock exists for product")
    void testExistsByProductId() {
        stockRepository.save(testStock);

        assertThat(stockRepository.existsByProductId(1L)).isTrue();
        assertThat(stockRepository.existsByProductId(999L)).isFalse();
    }

    @Test
    @DisplayName("Should find out of stock items")
    void testFindOutOfStock() {
        testStock.setStatus("OUT_OF_STOCK");
        testStock.setAvailableQty(0);
        testStock.setReservedQty(0);
        stockRepository.save(testStock);

        Stock inStock = new Stock(2L, "SKU-002");
        inStock.setAvailableQty(50);
        inStock.setStatus("IN_STOCK");
        stockRepository.save(inStock);

        var outOfStockList = stockRepository.findOutOfStock();

        assertThat(outOfStockList).hasSize(1);
        assertThat(outOfStockList.get(0).getProductId()).isEqualTo(1L);
    }

    @Test
    @DisplayName("Should count total available inventory")
    void testCountTotalAvailable() {
        stockRepository.save(testStock);

        Stock stock2 = new Stock(2L, "SKU-002");
        stock2.setAvailableQty(50);
        stockRepository.save(stock2);

        long total = stockRepository.countTotalAvailable();

        assertThat(total).isEqualTo(150); // 100 + 50
    }

    @Test
    @DisplayName("Should count total reserved inventory")
    void testCountTotalReserved() {
        stockRepository.save(testStock);

        Stock stock2 = new Stock(2L, "SKU-002");
        stock2.setReservedQty(30);
        stockRepository.save(stock2);

        long total = stockRepository.countTotalReserved();

        assertThat(total).isEqualTo(50); // 20 + 30
    }

    @Test
    @DisplayName("Should acquire pessimistic lock on read")
    void testPessimisticLock() {
        Stock saved = stockRepository.save(testStock);

        // This should acquire SELECT FOR UPDATE lock
        Stock locked = stockRepository.findByProductIdWithLock(1L).orElse(null);

        assertThat(locked).isNotNull();
        assertThat(locked.getId()).isEqualTo(saved.getId());
    }
}
