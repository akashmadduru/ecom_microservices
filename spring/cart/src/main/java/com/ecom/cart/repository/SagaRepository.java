package com.ecom.cart.repository;

import com.ecom.cart.domain.SagaState;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface SagaRepository extends JpaRepository<SagaState, UUID> {

    Optional<SagaState> findBySagaId(UUID sagaId);

    Optional<SagaState> findByCartId(Long cartId);

    List<SagaState> findByStatus(SagaState.SagaStatus status);

    @Query("SELECT s FROM SagaState s WHERE s.status = :status AND s.updatedAt < CURRENT_TIMESTAMP - INTERVAL '1 hour'")
    List<SagaState> findStaleSagas(@Param("status") SagaState.SagaStatus status);
}
