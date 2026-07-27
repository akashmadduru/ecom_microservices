package com.ecom.auth.exception;

public class InvalidTokenException extends AuthServiceException {
    public InvalidTokenException(String message) {
        super("INVALID_TOKEN", message);
    }

    public InvalidTokenException(String message, Object details) {
        super("INVALID_TOKEN", message, details);
    }
}
