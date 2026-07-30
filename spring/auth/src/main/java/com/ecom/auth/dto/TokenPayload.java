package com.ecom.auth.dto;

public record TokenPayload(
    String sub,          // user ID
    String username,
    String email,
    String role,
    String sid,          // session ID
    String jti,          // JWT ID for revocation
    String typ,          // token type: access or refresh
    long exp,            // expiration timestamp
    long iat,            // issued at timestamp
    long nbf,            // not before timestamp
    String iss,          // issuer
    String aud           // audience
) {
    public static TokenPayloadBuilder builder() {
        return new TokenPayloadBuilder();
    }

    public static class TokenPayloadBuilder {
        private String sub;
        private String username;
        private String email;
        private String role;
        private String sid;
        private String jti;
        private String typ;
        private long exp;
        private long iat;
        private long nbf;
        private String iss;
        private String aud;

        public TokenPayloadBuilder sub(String sub) {
            this.sub = sub;
            return this;
        }

        public TokenPayloadBuilder username(String username) {
            this.username = username;
            return this;
        }

        public TokenPayloadBuilder email(String email) {
            this.email = email;
            return this;
        }

        public TokenPayloadBuilder role(String role) {
            this.role = role;
            return this;
        }

        public TokenPayloadBuilder sid(String sid) {
            this.sid = sid;
            return this;
        }

        public TokenPayloadBuilder jti(String jti) {
            this.jti = jti;
            return this;
        }

        public TokenPayloadBuilder typ(String typ) {
            this.typ = typ;
            return this;
        }

        public TokenPayloadBuilder exp(long exp) {
            this.exp = exp;
            return this;
        }

        public TokenPayloadBuilder iat(long iat) {
            this.iat = iat;
            return this;
        }

        public TokenPayloadBuilder nbf(long nbf) {
            this.nbf = nbf;
            return this;
        }

        public TokenPayloadBuilder iss(String iss) {
            this.iss = iss;
            return this;
        }

        public TokenPayloadBuilder aud(String aud) {
            this.aud = aud;
            return this;
        }

        public TokenPayload build() {
            return new TokenPayload(sub, username, email, role, sid, jti, typ, exp, iat, nbf, iss, aud);
        }
    }
}
