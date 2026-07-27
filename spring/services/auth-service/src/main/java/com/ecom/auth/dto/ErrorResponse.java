package com.ecom.auth.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.ToString;

@Getter
@Setter
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
    @ToString
    public static class Error {
        private String code;
        private String message;
        private Object details;
        private String correlationId;
    }
}
