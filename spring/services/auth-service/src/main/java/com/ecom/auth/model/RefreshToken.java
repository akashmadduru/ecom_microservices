package com.ecom.auth.model;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.DynamicInsert;
import org.hibernate.annotations.DynamicUpdate;

import java.time.LocalDateTime;

@Entity
@Table(name = "refresh_tokens", indexes = {
    @Index(name = "idx_refresh_tokens_user_id", columnList = "user_id"),
    @Index(name = "idx_refresh_tokens_jti", columnList = "jti")
})
@DynamicInsert
@DynamicUpdate
public class RefreshToken {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(name = "user_id", nullable = false)
    private String userId;

    @Column(nullable = false, length = 255)
    private String tokenHash;

    @Column(nullable = false, unique = true, length = 255)
    private String jti;

    @Column(nullable = false)
    private LocalDateTime expiresAt;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public RefreshToken() {
    }

    public RefreshToken(String userId, String tokenHash, String jti, LocalDateTime expiresAt) {
        this.userId = userId;
        this.tokenHash = tokenHash;
        this.jti = jti;
        this.expiresAt = expiresAt;
    }

    public RefreshToken(String id, String userId, String tokenHash, String jti, LocalDateTime expiresAt, LocalDateTime createdAt) {
        this.id = id;
        this.userId = userId;
        this.tokenHash = tokenHash;
        this.jti = jti;
        this.expiresAt = expiresAt;
        this.createdAt = createdAt;
    }

    public String getId() {
        return this.id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getUserId() {
        return this.userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getTokenHash() {
        return this.tokenHash;
    }

    public void setTokenHash(String tokenHash) {
        this.tokenHash = tokenHash;
    }

    public String getJti() {
        return this.jti;
    }

    public void setJti(String jti) {
        this.jti = jti;
    }

    public LocalDateTime getExpiresAt() {
        return this.expiresAt;
    }

    public void setExpiresAt(LocalDateTime expiresAt) {
        this.expiresAt = expiresAt;
    }

    public LocalDateTime getCreatedAt() {
        return this.createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    @Override
    public String toString() {
        return "RefreshToken{" +
                "id='" + id + '\'' +
                ", userId='" + userId + '\'' +
                ", tokenHash='" + tokenHash + '\'' +
                ", jti='" + jti + '\'' +
                ", expiresAt=" + expiresAt +
                ", createdAt=" + createdAt +
                '}';
    }
}
