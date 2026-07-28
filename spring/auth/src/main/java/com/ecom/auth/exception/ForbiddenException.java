package com.ecom.auth.exception;

import org.springframework.http.HttpStatus;

public class ForbiddenException extends AuthException {
    public ForbiddenException(String message) {
        super("FORBIDDEN", HttpStatus.FORBIDDEN.value(), message);
    }

    public ForbiddenException(String message, Throwable cause) {
        super("FORBIDDEN", HttpStatus.FORBIDDEN.value(), message, cause);
    }
}
