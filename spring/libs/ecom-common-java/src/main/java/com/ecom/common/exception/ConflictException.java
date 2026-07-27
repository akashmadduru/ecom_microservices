package com.ecom.common.exception;

/**
 * Thrown when an operation conflicts with existing state (HTTP 409).
 * Examples: duplicate key violation, invalid state transition, resource already exists.
 */
public class ConflictException extends DomainException {
    public ConflictException(String message) {
        super("CONFLICT", message);
    }

    public ConflictException(String message, Object details) {
        super("CONFLICT", message, details);
    }
}
