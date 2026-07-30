package com.ecom.auth.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record TokenPairResponse(
    @JsonProperty("access_token")
    String accessToken,

    @JsonProperty("refresh_token")
    String refreshToken,

    @JsonProperty("token_type")
    String tokenType,

    @JsonProperty("expires_in")
    Integer expiresIn,

    String role
) {
    public TokenPairResponse(String accessToken, String refreshToken, Integer expiresIn, String role) {
        this(accessToken, refreshToken, "bearer", expiresIn, role);
    }

    public static TokenPairResponseBuilder builder() {
        return new TokenPairResponseBuilder();
    }

    public static class TokenPairResponseBuilder {
        private String accessToken;
        private String refreshToken;
        private String tokenType = "bearer";
        private Integer expiresIn;
        private String role;

        public TokenPairResponseBuilder accessToken(String accessToken) {
            this.accessToken = accessToken;
            return this;
        }

        public TokenPairResponseBuilder refreshToken(String refreshToken) {
            this.refreshToken = refreshToken;
            return this;
        }

        public TokenPairResponseBuilder tokenType(String tokenType) {
            this.tokenType = tokenType;
            return this;
        }

        public TokenPairResponseBuilder expiresIn(Integer expiresIn) {
            this.expiresIn = expiresIn;
            return this;
        }

        public TokenPairResponseBuilder role(String role) {
            this.role = role;
            return this;
        }

        public TokenPairResponse build() {
            return new TokenPairResponse(accessToken, refreshToken, tokenType, expiresIn, role);
        }
    }
}
