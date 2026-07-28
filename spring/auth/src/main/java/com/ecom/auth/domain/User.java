package com.ecom.auth.domain;

import jakarta.persistence.*;
import lombok.*;
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
@NoArgsConstructor
@AllArgsConstructor
@Getter
@Setter
@Builder
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, length = 100)
    private String username;

    @Column(length = 255, nullable = true)
    private String email;

    /**
     * Bcrypt hashed password. NULL for SSO-only accounts.
     */
    @Column(name = "password_hash", length = 255, nullable = true)
    private String passwordHash;

    /**
     * RBAC role: USER, ADMIN, etc.
     */
    @Column(nullable = false, length = 30)
    private String role;

    /**
     * Identity provider: "local", "google", etc.
     */
    @Column(nullable = false, length = 30)
    @Builder.Default
    private String provider = "local";

    /**
     * Provider-specific subject identifier, for SSO accounts.
     */
    @Column(name = "provider_sub", length = 255, nullable = true)
    private String providerSub;

    @Column(nullable = false)
    @Builder.Default
    private Boolean isActive = true;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(nullable = false)
    private Instant updatedAt;
}
