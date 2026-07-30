package com.ecom.auth.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ErrorResponse(
    int status,
    String code,
    String message,
    String path,
    Instant timestamp
) {
    public static ErrorResponseBuilder builder() {
        return new ErrorResponseBuilder();
    }

    public static class ErrorResponseBuilder {
        private int status;
        private String code;
        private String message;
        private String path;
        private Instant timestamp;

        public ErrorResponseBuilder status(int status) {
            this.status = status;
            return this;
        }

        public ErrorResponseBuilder code(String code) {
            this.code = code;
            return this;
        }

        public ErrorResponseBuilder message(String message) {
            this.message = message;
            return this;
        }

        public ErrorResponseBuilder path(String path) {
            this.path = path;
            return this;
        }

        public ErrorResponseBuilder timestamp(Instant timestamp) {
            this.timestamp = timestamp;
            return this;
        }

        public ErrorResponse build() {
            return new ErrorResponse(status, code, message, path, timestamp);
        }
    }
}
