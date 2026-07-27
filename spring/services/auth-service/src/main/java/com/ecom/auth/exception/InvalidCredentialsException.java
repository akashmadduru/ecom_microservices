package com.ecom.auth.exception;

public class InvalidCredentialsException extends AuthServiceException {
    public InvalidCredentialsException(String message) {
        super("INVALID_CREDENTIALS", message);
    }
}
