package com.ecom.auth.exception;

import org.springframework.http.HttpStatus;

public class ConflictException extends AuthException {
    public ConflictException(String message) {
        super("CONFLICT", HttpStatus.CONFLICT.value(), message);
    }

    public ConflictException(String message, Throwable cause) {
        super("CONFLICT", HttpStatus.CONFLICT.value(), message, cause);
    }
}
