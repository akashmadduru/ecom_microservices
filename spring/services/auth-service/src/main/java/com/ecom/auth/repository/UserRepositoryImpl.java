package com.ecom.auth.repository;

import com.ecom.auth.model.User;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.hibernate.Session;

import java.util.List;

public class UserRepositoryImpl implements UserRepositoryCustom {

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    public List<User> findUsersWithNaturalId(String username) {
        Session session = entityManager.unwrap(Session.class);
        return session.byNaturalId(User.class)
                .using("username", username)
                .loadOptional()
                .stream()
                .toList();
    }

    @Override
    public void refreshUserSession(String userId) {
        User user = entityManager.find(User.class, userId);
        if (user != null) {
            entityManager.refresh(user);
        }
    }

    @Override
    public long bulkDeactivateUsers(List<String> userIds) {
        int result = entityManager.createQuery(
                "UPDATE User u SET u.isActive = false WHERE u.id IN (:userIds)")
                .setParameter("userIds", userIds)
                .executeUpdate();
        return result;
    }
}
