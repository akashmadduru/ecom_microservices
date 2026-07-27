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
        return this.error;
    }

    public void setError(Error error) {
        this.error = error;
    }

    public static class Error {
        private String code;
        private String message;
        private Object details;
        private String correlationId;

        public Error() {
        }

        public Error(String code, String message, Object details, String correlationId) {
            this.code = code;
            this.message = message;
            this.details = details;
            this.correlationId = correlationId;
        }

        public String getCode() {
            return this.code;
        }

        public void setCode(String code) {
            this.code = code;
        }

        public String getMessage() {
            return this.message;
        }

        public void setMessage(String message) {
            this.message = message;
        }

        public Object getDetails() {
            return this.details;
        }

        public void setDetails(Object details) {
            this.details = details;
        }

        public String getCorrelationId() {
            return this.correlationId;
        }

        public void setCorrelationId(String correlationId) {
            this.correlationId = correlationId;
        }

        @Override
        public String toString() {
            return "Error{" +
                    "code='" + code + '\'' +
                    ", message='" + message + '\'' +
                    ", details=" + details +
                    ", correlationId='" + correlationId + '\'' +
                    '}';
        }
    }
}
