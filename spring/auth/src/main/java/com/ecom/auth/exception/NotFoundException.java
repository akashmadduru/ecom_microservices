package com.ecom.auth.exception;

import org.springframework.http.HttpStatus;

public class NotFoundException extends AuthException {
    public NotFoundException(String message) {
        super("NOT_FOUND", HttpStatus.NOT_FOUND.value(), message);
    }

    public NotFoundException(String message, Throwable cause) {
        super("NOT_FOUND", HttpStatus.NOT_FOUND.value(), message, cause);
    }
}
