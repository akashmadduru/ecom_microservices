package com.ecom.cart.event;

import com.ecom.cart.domain.SagaState;
import com.ecom.cart.repository.SagaRepository;
import jakarta.persistence.OptimisticLockException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDateTime;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Integration test for SagaState entity and state transitions.
 * Tests:
 * - SagaState creation and persistence
 * - State transitions (INITIATED → EXECUTING → SUCCESS)
 * - Optimistic locking on version field
 * - Timestamp fields (createdAt, updatedAt, startedAt, completedAt)
 */
@DataJpaTest
@ActiveProfiles("test")
public class SagaStateIntegrationTest {

    @Autowired
    private SagaRepository sagaRepository;

    private UUID testSagaId;
    private Long testCartId;

    @BeforeEach
    public void setUp() {
        testSagaId = UUID.randomUUID();
        testCartId = 1L;
    }

    @Test
    public void testCreateSagaState() {
        // Given
        SagaState sagaState = new SagaState(testSagaId, testCartId, SagaState.SagaStatus.INITIATED);

        // When
        SagaState saved = sagaRepository.save(sagaState);

        // Then
        assertNotNull(saved.getId());
        assertEquals(testSagaId, saved.getSagaId());
        assertEquals(testCartId, saved.getCartId());
        assertEquals(SagaState.SagaStatus.INITIATED, saved.getStatus());
        assertNotNull(saved.getCreatedAt());
        assertNotNull(saved.getUpdatedAt());
    }

    @Test
    public void testStateTransitionInitiatedToExecuting() {
        // Given
        SagaState sagaState = new SagaState(testSagaId, testCartId, SagaState.SagaStatus.INITIATED);
        sagaState.setStartedAt(LocalDateTime.now());
        SagaState saved = sagaRepository.save(sagaState);

        // When
        saved.setStatus(SagaState.SagaStatus.EXECUTING);
        SagaState updated = sagaRepository.save(saved);

        // Then
        assertEquals(SagaState.SagaStatus.EXECUTING, updated.getStatus());
    }

    @Test
    public void testStateTransitionExecutingToSuccess() {
        // Given
        SagaState sagaState = new SagaState(testSagaId, testCartId, SagaState.SagaStatus.EXECUTING);
        sagaState.setStartedAt(LocalDateTime.now());
        SagaState saved = sagaRepository.save(sagaState);

        // When
        saved.setStatus(SagaState.SagaStatus.SUCCESS);
        saved.setCompletedAt(LocalDateTime.now());
        SagaState updated = sagaRepository.save(saved);

        // Then
        assertEquals(SagaState.SagaStatus.SUCCESS, updated.getStatus());
        assertNotNull(updated.getCompletedAt());
    }

    @Test
    public void testFindBySagaId() {
        // Given
        SagaState sagaState = new SagaState(testSagaId, testCartId, SagaState.SagaStatus.INITIATED);
        sagaRepository.save(sagaState);

        // When
        var found = sagaRepository.findBySagaId(testSagaId);

        // Then
        assertTrue(found.isPresent());
        assertEquals(testSagaId, found.get().getSagaId());
    }

    @Test
    public void testFindByCartId() {
        // Given
        SagaState sagaState = new SagaState(testSagaId, testCartId, SagaState.SagaStatus.INITIATED);
        sagaRepository.save(sagaState);

        // When
        var found = sagaRepository.findByCartId(testCartId);

        // Then
        assertTrue(found.isPresent());
        assertEquals(testCartId, found.get().getCartId());
    }

    @Test
    public void testOptimisticLocking() {
        // Given
        SagaState sagaState = new SagaState(testSagaId, testCartId, SagaState.SagaStatus.INITIATED);
        SagaState saved = sagaRepository.save(sagaState);
        Long initialVersion = saved.getVersion();

        // When
        saved.setStatus(SagaState.SagaStatus.EXECUTING);
        SagaState updated = sagaRepository.save(saved);

        // Then
        assertTrue(updated.getVersion() > initialVersion, "Version should increment after update");
    }
}
