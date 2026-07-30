package com.ecom.auth.dto;

import jakarta.validation.constraints.NotBlank;

public record GoogleLoginRequest(
    @NotBlank(message = "Token is required")
    String token
) {
}
