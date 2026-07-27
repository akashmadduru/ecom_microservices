package com.ecom.auth.security;

public class JwtProcessingException extends Exception {
    public JwtProcessingException(String message) {
        super(message);
    }

    public JwtProcessingException(String message, Throwable cause) {
        super(message, cause);
    }
}
