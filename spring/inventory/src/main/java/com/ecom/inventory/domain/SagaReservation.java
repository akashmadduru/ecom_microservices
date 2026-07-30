package com.ecom.inventory.domain;

import jakarta.persistence.*;

import java.time.LocalDateTime;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "saga_reservation", indexes = {
    @Index(name = "idx_saga_reservation_saga_id", columnList = "saga_id"),
    @Index(name = "idx_saga_reservation_product_id", columnList = "product_id"),
    @Index(name = "idx_saga_reservation_status", columnList = "status")
})
public class SagaReservation {

    public enum ReservationStatus {
        RESERVED,
        RELEASED,
        FAILED
    }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "reservation_id", nullable = false, unique = true)
    private UUID reservationId;

    @Column(name = "saga_id", nullable = false)
    private UUID sagaId;

    @Column(name = "product_id", nullable = false)
    private Long productId;

    @Column(name = "quantity", nullable = false)
    private Integer quantity;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private ReservationStatus status;

    @Version
    @Column(name = "version")
    private Long version;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public SagaReservation() {
    }

    public SagaReservation(UUID reservationId, UUID sagaId, Long productId, Integer quantity, ReservationStatus status) {
        this.reservationId = reservationId;
        this.sagaId = sagaId;
        this.productId = productId;
        this.quantity = quantity;
        this.status = status;
    }

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public UUID getReservationId() {
        return reservationId;
    }

    public void setReservationId(UUID reservationId) {
        this.reservationId = reservationId;
    }

    public UUID getSagaId() {
        return sagaId;
    }

    public void setSagaId(UUID sagaId) {
        this.sagaId = sagaId;
    }

    public Long getProductId() {
        return productId;
    }

    public void setProductId(Long productId) {
        this.productId = productId;
    }

    public Integer getQuantity() {
        return quantity;
    }

    public void setQuantity(Integer quantity) {
        this.quantity = quantity;
    }

    public ReservationStatus getStatus() {
        return status;
    }

    public void setStatus(ReservationStatus status) {
        this.status = status;
    }

    public Long getVersion() {
        return version;
    }

    public void setVersion(Long version) {
        this.version = version;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    @Override
    public String toString() {
        return "SagaReservation{" +
                "id=" + id +
                ", reservationId=" + reservationId +
                ", sagaId=" + sagaId +
                ", productId=" + productId +
                ", quantity=" + quantity +
                ", status=" + status +
                ", version=" + version +
                ", createdAt=" + createdAt +
                ", updatedAt=" + updatedAt +
                '}';
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        SagaReservation that = (SagaReservation) o;
        return Objects.equals(id, that.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }
}
