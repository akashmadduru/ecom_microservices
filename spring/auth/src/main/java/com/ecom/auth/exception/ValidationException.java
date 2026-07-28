package com.ecom.auth.exception;

import org.springframework.http.HttpStatus;

public class ValidationException extends AuthException {
    public ValidationException(String message) {
        super("VALIDATION_ERROR", HttpStatus.BAD_REQUEST.value(), message);
    }

    public ValidationException(String message, Throwable cause) {
        super("VALIDATION_ERROR", HttpStatus.BAD_REQUEST.value(), message, cause);
    }
}
