package com.ecom.auth.domain;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "users", indexes = {
    @Index(name = "idx_username", columnList = "username", unique = true),
    @Index(name = "idx_email", columnList = "email", unique = true),
    @Index(name = "idx_provider_sub", columnList = "provider_sub", unique = true),
    @Index(name = "idx_provider", columnList = "provider")
})
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, length = 100)
    private String username;

    @Column(length = 255, nullable = true)
    private String email;

    @Column(name = "password_hash", length = 255, nullable = true)
    private String passwordHash;

    @Column(nullable = false, length = 30)
    private String role;

    @Column(nullable = false, length = 30)
    private String provider = "local";

    @Column(name = "provider_sub", length = 255, nullable = true)
    private String providerSub;

    @Column(nullable = false)
    private Boolean isActive = true;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(nullable = false)
    private Instant updatedAt;

    public User() {
    }

    public User(UUID id, String username, String email, String passwordHash, String role, String provider, String providerSub, Boolean isActive, Instant createdAt, Instant updatedAt) {
        this.id = id;
        this.username = username;
        this.email = email;
        this.passwordHash = passwordHash;
        this.role = role;
        this.provider = provider;
        this.providerSub = providerSub;
        this.isActive = isActive;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public String getProvider() {
        return provider;
    }

    public void setProvider(String provider) {
        this.provider = provider;
    }

    public String getProviderSub() {
        return providerSub;
    }

    public void setProviderSub(String providerSub) {
        this.providerSub = providerSub;
    }

    public Boolean getIsActive() {
        return isActive;
    }

    public void setIsActive(Boolean isActive) {
        this.isActive = isActive;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    public static UserBuilder builder() {
        return new UserBuilder();
    }

    public static class UserBuilder {
        private UUID id;
        private String username;
        private String email;
        private String passwordHash;
        private String role;
        private String provider = "local";
        private String providerSub;
        private Boolean isActive = true;
        private Instant createdAt;
        private Instant updatedAt;

        public UserBuilder id(UUID id) {
            this.id = id;
            return this;
        }

        public UserBuilder username(String username) {
            this.username = username;
            return this;
        }

        public UserBuilder email(String email) {
            this.email = email;
            return this;
        }

        public UserBuilder passwordHash(String passwordHash) {
            this.passwordHash = passwordHash;
            return this;
        }

        public UserBuilder role(String role) {
            this.role = role;
            return this;
        }

        public UserBuilder provider(String provider) {
            this.provider = provider;
            return this;
        }

        public UserBuilder providerSub(String providerSub) {
            this.providerSub = providerSub;
            return this;
        }

        public UserBuilder isActive(Boolean isActive) {
            this.isActive = isActive;
            return this;
        }

        public UserBuilder createdAt(Instant createdAt) {
            this.createdAt = createdAt;
            return this;
        }

        public UserBuilder updatedAt(Instant updatedAt) {
            this.updatedAt = updatedAt;
            return this;
        }

        public User build() {
            return new User(id, username, email, passwordHash, role, provider, providerSub, isActive, createdAt, updatedAt);
        }
    }
}
