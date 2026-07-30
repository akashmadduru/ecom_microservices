package com.ecom.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SSOLoginRequest(
    @NotBlank(message = "Provider is required")
    @Size(min = 2, max = 50, message = "Provider must be between 2 and 50 characters")
    String provider,

    @NotBlank(message = "Subject is required")
    @Size(min = 1, max = 255, message = "Subject must be between 1 and 255 characters")
    String subject,

    String email,

    String displayName
) {
    public static SSOLoginRequestBuilder builder() {
        return new SSOLoginRequestBuilder();
    }

    public static class SSOLoginRequestBuilder {
        private String provider;
        private String subject;
        private String email;
        private String displayName;

        public SSOLoginRequestBuilder provider(String provider) {
            this.provider = provider;
            return this;
        }

        public SSOLoginRequestBuilder subject(String subject) {
            this.subject = subject;
            return this;
        }

        public SSOLoginRequestBuilder email(String email) {
            this.email = email;
            return this;
        }

        public SSOLoginRequestBuilder displayName(String displayName) {
            this.displayName = displayName;
            return this;
        }

        public SSOLoginRequest build() {
            return new SSOLoginRequest(provider, subject, email, displayName);
        }
    }
}
