package com.ecom.auth.exception;

import org.springframework.http.HttpStatus;

public class UnauthorizedException extends AuthException {
    public UnauthorizedException(String message) {
        super("UNAUTHORIZED", HttpStatus.UNAUTHORIZED.value(), message);
    }

    public UnauthorizedException(String message, Throwable cause) {
        super("UNAUTHORIZED", HttpStatus.UNAUTHORIZED.value(), message, cause);
    }
}
