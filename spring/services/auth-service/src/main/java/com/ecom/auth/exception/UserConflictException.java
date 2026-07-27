package com.ecom.auth.exception;

public class UserConflictException extends AuthServiceException {
    public UserConflictException(String message) {
        super("USER_CONFLICT", message);
    }

    public UserConflictException(String message, Object details) {
        super("USER_CONFLICT", message, details);
    }
}
