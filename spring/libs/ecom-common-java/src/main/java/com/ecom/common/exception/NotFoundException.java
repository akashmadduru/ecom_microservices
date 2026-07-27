package com.ecom.common.exception;

/**
 * Thrown when a requested resource is not found (HTTP 404).
 */
public class NotFoundException extends DomainException {
    public NotFoundException(String message) {
        super("NOT_FOUND", message);
    }

    public NotFoundException(String message, Object details) {
        super("NOT_FOUND", message, details);
    }
}
