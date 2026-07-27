package com.ecom.auth.repository;

import com.ecom.auth.model.User;

import java.util.List;

public interface UserRepositoryCustom {
    List<User> findUsersWithNaturalId(String username);
    void refreshUserSession(String userId);
    long bulkDeactivateUsers(List<String> userIds);
}
