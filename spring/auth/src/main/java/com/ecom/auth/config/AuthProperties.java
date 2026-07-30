package com.ecom.auth.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "auth")
public class AuthProperties {
    private String jwtSecret;
    private String jwtIssuer = "auth-service";
    private String jwtAudience = "ecom-api";
    private int accessTokenExpireMinutes = 15;
    private int refreshTokenExpireDays = 7;
    private String googleOAuth2ClientId;
    private String googleOAuth2ClientSecret;
    private String googleOAuth2RedirectUri = "http://localhost:8082/api/v1/auth/sso/google/callback";

    public String getJwtSecret() {
        return jwtSecret;
    }

    public void setJwtSecret(String jwtSecret) {
        this.jwtSecret = jwtSecret;
    }

    public String getJwtIssuer() {
        return jwtIssuer;
    }

    public void setJwtIssuer(String jwtIssuer) {
        this.jwtIssuer = jwtIssuer;
    }

    public String getJwtAudience() {
        return jwtAudience;
    }

    public void setJwtAudience(String jwtAudience) {
        this.jwtAudience = jwtAudience;
    }

    public int getAccessTokenExpireMinutes() {
        return accessTokenExpireMinutes;
    }

    public void setAccessTokenExpireMinutes(int accessTokenExpireMinutes) {
        this.accessTokenExpireMinutes = accessTokenExpireMinutes;
    }

    public int getRefreshTokenExpireDays() {
        return refreshTokenExpireDays;
    }

    public void setRefreshTokenExpireDays(int refreshTokenExpireDays) {
        this.refreshTokenExpireDays = refreshTokenExpireDays;
    }

    public String getGoogleOAuth2ClientId() {
        return googleOAuth2ClientId;
    }

    public void setGoogleOAuth2ClientId(String googleOAuth2ClientId) {
        this.googleOAuth2ClientId = googleOAuth2ClientId;
    }

    public String getGoogleOAuth2ClientSecret() {
        return googleOAuth2ClientSecret;
    }

    public void setGoogleOAuth2ClientSecret(String googleOAuth2ClientSecret) {
        this.googleOAuth2ClientSecret = googleOAuth2ClientSecret;
    }

    public String getGoogleOAuth2RedirectUri() {
        return googleOAuth2RedirectUri;
    }

    public void setGoogleOAuth2RedirectUri(String googleOAuth2RedirectUri) {
        this.googleOAuth2RedirectUri = googleOAuth2RedirectUri;
    }
}
