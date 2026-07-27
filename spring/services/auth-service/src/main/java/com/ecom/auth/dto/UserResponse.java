package com.ecom.auth.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.ToString;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@ToString
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

    public UserResponse(String userId, String username, String email, String role, String provider, Boolean isActive) {
        this.userId = userId;
        this.username = username;
        this.email = email;
        this.role = role;
        this.provider = provider;
        this.isActive = isActive;
        this.authenticated = true;
    }
}
