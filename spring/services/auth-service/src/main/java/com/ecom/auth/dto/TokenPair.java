package com.ecom.auth.dto;

public class TokenPair {
    public String accessToken;
    public String refreshToken;

    public TokenPair() {}

    public TokenPair(String accessToken, String refreshToken) {
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
    }
}

