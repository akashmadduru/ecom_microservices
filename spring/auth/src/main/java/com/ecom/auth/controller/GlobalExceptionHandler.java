package com.ecom.auth.controller;

import com.ecom.auth.dto.ErrorResponse;
import com.ecom.auth.exception.AuthException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;

import java.time.Instant;

@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(AuthException.class)
    public ResponseEntity<ErrorResponse> handleAuthException(AuthException ex, WebRequest request) {
        log.error("Auth exception: {} - {}", ex.getCode(), ex.getMessage());

        ErrorResponse response = ErrorResponse.builder()
            .status(ex.getStatus())
            .code(ex.getCode())
            .message(ex.getMessage())
            .path(request.getDescription(false).replace("uri=", ""))
            .timestamp(Instant.now())
            .build();

        return new ResponseEntity<>(response, HttpStatus.valueOf(ex.getStatus()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidationException(MethodArgumentNotValidException ex, WebRequest request) {
        String message = ex.getBindingResult().getFieldErrors().stream()
            .map(e -> e.getField() + ": " + e.getDefaultMessage())
            .findFirst()
            .orElse("Validation failed");

        ErrorResponse response = ErrorResponse.builder()
            .status(HttpStatus.BAD_REQUEST.value())
            .code("VALIDATION_ERROR")
            .message(message)
            .path(request.getDescription(false).replace("uri=", ""))
            .timestamp(Instant.now())
            .build();

        return new ResponseEntity<>(response, HttpStatus.BAD_REQUEST);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGenericException(Exception ex, WebRequest request) {
        log.error("Unexpected error", ex);

        ErrorResponse response = ErrorResponse.builder()
            .status(HttpStatus.INTERNAL_SERVER_ERROR.value())
            .code("INTERNAL_SERVER_ERROR")
            .message("An unexpected error occurred")
            .path(request.getDescription(false).replace("uri=", ""))
            .timestamp(Instant.now())
            .build();

        return new ResponseEntity<>(response, HttpStatus.INTERNAL_SERVER_ERROR);
    }
}
