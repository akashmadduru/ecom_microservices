package com.ecom.auth.exception;

public abstract class AuthException extends RuntimeException {
    private final String code;
    private final int status;

    public AuthException(String code, int status, String message) {
        super(message);
        this.code = code;
        this.status = status;
    }

    public AuthException(String code, int status, String message, Throwable cause) {
        super(message, cause);
        this.code = code;
        this.status = status;
    }

    public String getCode() {
        return code;
    }

    public int getStatus() {
        return status;
    }
}
