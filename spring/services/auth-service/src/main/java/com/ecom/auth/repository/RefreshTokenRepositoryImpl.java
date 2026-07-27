package com.ecom.auth.repository;

import com.ecom.auth.model.RefreshToken;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.hibernate.Session;

import java.time.LocalDateTime;
import java.util.List;

public class RefreshTokenRepositoryImpl implements RefreshTokenRepositoryCustom {

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    public List<RefreshToken> findActiveTokensByUserId(String userId) {
        LocalDateTime now = LocalDateTime.now();
        return entityManager.createQuery(
                "SELECT rt FROM RefreshToken rt WHERE rt.userId = :userId AND rt.expiresAt > :now ORDER BY rt.createdAt DESC",
                RefreshToken.class)
                .setParameter("userId", userId)
                .setParameter("now", now)
                .getResultList();
    }

    @Override
    public int cleanupExpiredTokens() {
        LocalDateTime now = LocalDateTime.now();
        int result = entityManager.createQuery(
                "DELETE FROM RefreshToken rt WHERE rt.expiresAt <= :now")
                .setParameter("now", now)
                .executeUpdate();

        Session session = entityManager.unwrap(Session.class);
        session.flush();

        return result;
    }

    @Override
    public void invalidateUserTokens(String userId, LocalDateTime invalidateBefore) {
        entityManager.createQuery(
                "DELETE FROM RefreshToken rt WHERE rt.userId = :userId AND rt.createdAt < :cutoff")
                .setParameter("userId", userId)
                .setParameter("cutoff", invalidateBefore)
                .executeUpdate();
    }
}
