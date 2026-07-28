package com.ecom.auth.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TokenPayload {
    private String sub;          // user ID
    private String username;
    private String email;
    private String role;
    private String sid;          // session ID
    private String jti;          // JWT ID for revocation
    private String typ;          // token type: access or refresh
    private long exp;            // expiration timestamp
    private long iat;            // issued at timestamp
    private long nbf;            // not before timestamp
    private String iss;          // issuer
    private String aud;          // audience
}
