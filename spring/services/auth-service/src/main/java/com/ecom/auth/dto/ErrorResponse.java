package com.ecom.auth.dto;

public class ErrorResponse {
    private Error error;

    public ErrorResponse(String code, String message) {
        this.error = new Error(code, message, null, null);
    }

    public ErrorResponse(String code, String message, Object details) {
        this.error = new Error(code, message, details, null);
    }

    public Error getError() {
        return error;
    }

    public void setError(Error error) {
        this.error = error;
    }

    public static class Error {
        private String code;
        private String message;
        private Object details;
        private String correlationId;

        public Error(String code, String message, Object details, String correlationId) {
            this.code = code;
            this.message = message;
            this.details = details;
            this.correlationId = correlationId;
        }

        public String getCode() {
            return code;
        }

        public void setCode(String code) {
            this.code = code;
        }

        public String getMessage() {
            return message;
        }

        public void setMessage(String message) {
            this.message = message;
        }

        public Object getDetails() {
            return details;
        }

        public void setDetails(Object details) {
            this.details = details;
        }

        public String getCorrelationId() {
            return correlationId;
        }

        public void setCorrelationId(String correlationId) {
            this.correlationId = correlationId;
        }
    }
}
