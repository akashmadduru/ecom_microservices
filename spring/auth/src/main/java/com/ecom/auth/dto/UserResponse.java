package com.ecom.auth.dto;

import java.time.Instant;
import java.util.UUID;

public record UserResponse(
    UUID id,
    String username,
    String email,
    String role,
    String provider,
    Boolean isActive,
    Instant createdAt,
    Instant updatedAt
) {
    public static UserResponseBuilder builder() {
        return new UserResponseBuilder();
    }

    public static class UserResponseBuilder {
        private UUID id;
        private String username;
        private String email;
        private String role;
        private String provider;
        private Boolean isActive;
        private Instant createdAt;
        private Instant updatedAt;

        public UserResponseBuilder id(UUID id) {
            this.id = id;
            return this;
        }

        public UserResponseBuilder username(String username) {
            this.username = username;
            return this;
        }

        public UserResponseBuilder email(String email) {
            this.email = email;
            return this;
        }

        public UserResponseBuilder role(String role) {
            this.role = role;
            return this;
        }

        public UserResponseBuilder provider(String provider) {
            this.provider = provider;
            return this;
        }

        public UserResponseBuilder isActive(Boolean isActive) {
            this.isActive = isActive;
            return this;
        }

        public UserResponseBuilder createdAt(Instant createdAt) {
            this.createdAt = createdAt;
            return this;
        }

        public UserResponseBuilder updatedAt(Instant updatedAt) {
            this.updatedAt = updatedAt;
            return this;
        }

        public UserResponse build() {
            return new UserResponse(id, username, email, role, provider, isActive, createdAt, updatedAt);
        }
    }
}
