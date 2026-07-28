package com.ecom.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SSOLoginRequest {
    @NotBlank(message = "Provider is required")
    @Size(min = 2, max = 50, message = "Provider must be between 2 and 50 characters")
    private String provider;

    @NotBlank(message = "Subject is required")
    @Size(min = 1, max = 255, message = "Subject must be between 1 and 255 characters")
    private String subject;

    private String email;

    private String displayName;
}
