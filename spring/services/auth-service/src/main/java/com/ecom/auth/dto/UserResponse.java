package com.ecom.auth.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public class UserResponse {
    @JsonProperty("user_id")
    private String userId;

    private String username;
    private String email;
    private String role;
    private String provider;

    @JsonProperty("is_active")
    private Boolean isActive;

    @JsonProperty("authenticated")
    private Boolean authenticated;

    public UserResponse() {
    }

    public UserResponse(String userId, String username, String email, String role, String provider, Boolean isActive) {
        this.userId = userId;
        this.username = username;
        this.email = email;
        this.role = role;
        this.provider = provider;
        this.isActive = isActive;
        this.authenticated = true;
    }

    public UserResponse(String userId, String username, String email, String role, String provider, Boolean isActive, Boolean authenticated) {
        this.userId = userId;
        this.username = username;
        this.email = email;
        this.role = role;
        this.provider = provider;
        this.isActive = isActive;
        this.authenticated = authenticated;
    }

    public String getUserId() {
        return this.userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getUsername() {
        return this.username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getEmail() {
        return this.email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getRole() {
        return this.role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public String getProvider() {
        return this.provider;
    }

    public void setProvider(String provider) {
        this.provider = provider;
    }

    public Boolean getIsActive() {
        return this.isActive;
    }

    public void setIsActive(Boolean isActive) {
        this.isActive = isActive;
    }

    public Boolean getAuthenticated() {
        return this.authenticated;
    }

    public void setAuthenticated(Boolean authenticated) {
        this.authenticated = authenticated;
    }

    @Override
    public String toString() {
        return "UserResponse{" +
                "userId='" + userId + '\'' +
                ", username='" + username + '\'' +
                ", email='" + email + '\'' +
                ", role='" + role + '\'' +
                ", provider='" + provider + '\'' +
                ", isActive=" + isActive +
                ", authenticated=" + authenticated +
                '}';
    }
}
