package com.ecom.common.exception;

/**
 * Thrown when a user lacks permission for an operation (HTTP 403).
 */
public class ForbiddenException extends DomainException {
    public ForbiddenException(String message) {
        super("FORBIDDEN", message);
    }

    public ForbiddenException(String message, Object details) {
        super("FORBIDDEN", message, details);
    }
}
