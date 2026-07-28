package com.ecom.auth.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "auth")
@Data
public class AuthProperties {
    private String jwtSecret;
    private String jwtIssuer = "auth-service";
    private String jwtAudience = "ecom-api";
    private int accessTokenExpireMinutes = 15;
    private int refreshTokenExpireDays = 7;
    private String googleOAuth2ClientId;
    private String googleOAuth2ClientSecret;
    private String googleOAuth2RedirectUri = "http://localhost:8082/api/v1/auth/sso/google/callback";
}
