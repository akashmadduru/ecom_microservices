package com.ecom.inventory.repository;

import com.ecom.inventory.domain.SagaReservation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ReservationRepository extends JpaRepository<SagaReservation, UUID> {

    List<SagaReservation> findBySagaId(UUID sagaId);

    List<SagaReservation> findByProductId(Long productId);

    List<SagaReservation> findByStatus(SagaReservation.ReservationStatus status);

    Optional<SagaReservation> findByReservationId(UUID reservationId);
}
