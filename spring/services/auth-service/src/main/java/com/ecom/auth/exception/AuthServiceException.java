package com.ecom.auth.exception;

public class AuthServiceException extends RuntimeException {
    private final String code;
    private final Object details;

    public AuthServiceException(String code, String message) {
        super(message);
        this.code = code;
        this.details = null;
    }

    public AuthServiceException(String code, String message, Object details) {
        super(message);
        this.code = code;
        this.details = details;
    }

    public String getCode() {
        return code;
    }

    public Object getDetails() {
        return details;
    }
}
