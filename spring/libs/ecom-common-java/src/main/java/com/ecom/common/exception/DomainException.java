package com.ecom.common.exception;

/**
 * Base exception for domain-level errors. Extends RuntimeException to support
 * unchecked exception handling in Spring services.
 *
 * Carries a code for error discrimination and optional details for richer
 * error responses.
 */
public class DomainException extends RuntimeException {
    private final String code;
    private final Object details;

    public DomainException(String code, String message) {
        super(message);
        this.code = code;
        this.details = null;
    }

    public DomainException(String code, String message, Object details) {
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
