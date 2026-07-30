package com.ecom.cart.domain;

import jakarta.persistence.*;

import java.time.LocalDateTime;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "saga_state", indexes = {
    @Index(name = "idx_saga_state_saga_id", columnList = "saga_id"),
    @Index(name = "idx_saga_state_cart_id", columnList = "cart_id"),
    @Index(name = "idx_saga_state_status", columnList = "status")
})
public class SagaState {

    public enum SagaStatus {
        INITIATED,
        EXECUTING,
        SUCCESS,
        FAILED,
        TIMEOUT,
        COMPENSATING,
        COMPENSATED
    }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "saga_id", nullable = false, unique = true)
    private UUID sagaId;

    @Column(name = "cart_id", nullable = false)
    private Long cartId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private SagaStatus status;

    @Version
    @Column(name = "version")
    private Long version;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Column(name = "started_at")
    private LocalDateTime startedAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    public SagaState() {
    }

    public SagaState(UUID sagaId, Long cartId, SagaStatus status) {
        this.sagaId = sagaId;
        this.cartId = cartId;
        this.status = status;
    }

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public UUID getSagaId() {
        return sagaId;
    }

    public void setSagaId(UUID sagaId) {
        this.sagaId = sagaId;
    }

    public Long getCartId() {
        return cartId;
    }

    public void setCartId(Long cartId) {
        this.cartId = cartId;
    }

    public SagaStatus getStatus() {
        return status;
    }

    public void setStatus(SagaStatus status) {
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

    public LocalDateTime getStartedAt() {
        return startedAt;
    }

    public void setStartedAt(LocalDateTime startedAt) {
        this.startedAt = startedAt;
    }

    public LocalDateTime getCompletedAt() {
        return completedAt;
    }

    public void setCompletedAt(LocalDateTime completedAt) {
        this.completedAt = completedAt;
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
        return "SagaState{" +
                "id=" + id +
                ", sagaId=" + sagaId +
                ", cartId=" + cartId +
                ", status=" + status +
                ", version=" + version +
                ", createdAt=" + createdAt +
                ", updatedAt=" + updatedAt +
                ", startedAt=" + startedAt +
                ", completedAt=" + completedAt +
                '}';
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        SagaState sagaState = (SagaState) o;
        return Objects.equals(id, sagaState.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }
}
