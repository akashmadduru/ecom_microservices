package com.ecom.inventory.repository;

import com.ecom.inventory.entity.Reservation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ReservationRepository extends JpaRepository<Reservation, Long> {

    List<Reservation> findByProductId(Long productId);

    List<Reservation> findByUserIdAndIsReleasedFalse(String userId);

    List<Reservation> findByProductIdAndIsReleasedFalse(Long productId);
}
