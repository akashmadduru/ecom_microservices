package com.ecom.product.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * ErrorResponse: standard error response format.
 * Matches auth-service error response pattern.
 */
public class ErrorResponse {
    private Error error;

    public ErrorResponse() {}

    public ErrorResponse(String code, String message) {
        this.error = new Error(code, message, null, null);
    }

    public ErrorResponse(String code, String message, Object details) {
        this.error = new Error(code, message, details, null);
    }

    public Error getError() { return this.error; }
    public void setError(Error error) { this.error = error; }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class Error {
        private String code;
        private String message;
        private Object details;

        @JsonProperty("correlation_id")
        private String correlationId;

        public Error() {}

        public Error(String code, String message, Object details, String correlationId) {
            this.code = code;
            this.message = message;
            this.details = details;
            this.correlationId = correlationId;
        }

        public String getCode() { return this.code; }
        public void setCode(String code) { this.code = code; }
        public String getMessage() { return this.message; }
        public void setMessage(String message) { this.message = message; }
        public Object getDetails() { return this.details; }
        public void setDetails(Object details) { this.details = details; }
        public String getCorrelationId() { return this.correlationId; }
        public void setCorrelationId(String correlationId) { this.correlationId = correlationId; }
    }
}
