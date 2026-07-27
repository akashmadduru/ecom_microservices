package com.ecom.auth.repository;

import com.ecom.auth.model.RefreshToken;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface RefreshTokenRepository extends BaseRepository<RefreshToken, String>, RefreshTokenRepositoryCustom {

    @Query("SELECT rt FROM RefreshToken rt WHERE rt.jti = :jti")
    Optional<RefreshToken> findByJti(@Param("jti") String jti);

    @Modifying
    @Query("DELETE FROM RefreshToken rt WHERE rt.userId = :userId")
    void deleteByUserId(@Param("userId") String userId);

    @Query("SELECT rt FROM RefreshToken rt WHERE rt.userId = :userId")
    List<RefreshToken> findAllByUserId(@Param("userId") String userId);

    @Query("SELECT rt FROM RefreshToken rt WHERE rt.expiresAt <= :currentTime")
    List<RefreshToken> findExpiredTokens(@Param("currentTime") LocalDateTime currentTime);

    @Modifying
    @Query("DELETE FROM RefreshToken rt WHERE rt.expiresAt <= :currentTime")
    int deleteExpiredTokens(@Param("currentTime") LocalDateTime currentTime);

    @Query("SELECT COUNT(rt) FROM RefreshToken rt WHERE rt.userId = :userId")
    long countByUserId(@Param("userId") String userId);

    @Query("SELECT CASE WHEN COUNT(rt) > 0 THEN true ELSE false END FROM RefreshToken rt WHERE rt.jti = :jti")
    boolean existsByJti(@Param("jti") String jti);

    @Modifying
    @Query("DELETE FROM RefreshToken rt WHERE rt.userId = :userId AND rt.createdAt < :cutoffDate")
    int deleteOldTokensByUserId(@Param("userId") String userId, @Param("cutoffDate") LocalDateTime cutoffDate);
}
