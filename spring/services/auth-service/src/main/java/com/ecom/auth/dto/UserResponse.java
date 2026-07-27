package com.ecom.auth.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public class UserResponse {
    @JsonProperty("user_id")
    public String userId;

    public String username;
    public String email;
    public String role;
    public String provider;

    @JsonProperty("is_active")
    public Boolean isActive;

    @JsonProperty("authenticated")
    public Boolean authenticated;

    public UserResponse() {}

    public UserResponse(String userId, String username, String email, String role, String provider, Boolean isActive) {
        this.userId = userId;
        this.username = username;
        this.email = email;
        this.role = role;
        this.provider = provider;
        this.isActive = isActive;
        this.authenticated = true;
    }

    public String getUserId() {
        return userId;
    }

    public String getUsername() {
        return username;
    }

    public String getEmail() {
        return email;
    }

    public String getRole() {
        return role;
    }

    public String getProvider() {
        return provider;
    }

    public Boolean getIsActive() {
        return isActive;
    }

    public Boolean getAuthenticated() {
        return authenticated;
    }
}
