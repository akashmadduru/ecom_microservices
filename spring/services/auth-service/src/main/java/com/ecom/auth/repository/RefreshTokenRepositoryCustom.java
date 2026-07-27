package com.ecom.auth.repository;

import com.ecom.auth.model.RefreshToken;

import java.time.LocalDateTime;
import java.util.List;

public interface RefreshTokenRepositoryCustom {
    List<RefreshToken> findActiveTokensByUserId(String userId);
    int cleanupExpiredTokens();
    void invalidateUserTokens(String userId, LocalDateTime invalidateBefore);
}
