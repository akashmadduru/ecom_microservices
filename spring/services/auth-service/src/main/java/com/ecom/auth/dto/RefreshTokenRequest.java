package com.ecom.auth.dto;

import jakarta.validation.constraints.NotBlank;
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
public class RefreshTokenRequest {
    @NotBlank(message = "Refresh token is required")
    @JsonProperty("refresh_token")
    private String refreshToken;
}
