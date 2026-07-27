package com.ecom.common.exception;

/**
 * Thrown when input validation fails (HTTP 422 Unprocessable Entity).
 */
public class ValidationException extends DomainException {
    public ValidationException(String message) {
        super("VALIDATION_ERROR", message);
    }

    public ValidationException(String message, Object details) {
        super("VALIDATION_ERROR", message, details);
    }
}
