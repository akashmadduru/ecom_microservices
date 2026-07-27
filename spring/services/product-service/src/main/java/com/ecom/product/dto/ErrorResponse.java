package com.ecom.product.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * ErrorResponse: standard error response format.
 * Matches auth-service error response pattern.
 */
@Getter
@Setter
@NoArgsConstructor
public class ErrorResponse {
    private Error error;

    public ErrorResponse(String code, String message) {
        this.error = new Error(code, message, null, null);
    }

    public ErrorResponse(String code, String message, Object details) {
        this.error = new Error(code, message, details, null);
    }

    @Getter
    @Setter
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class Error {
        private String code;
        private String message;
        private Object details;

        @JsonProperty("correlation_id")
        private String correlationId;
    }
}
