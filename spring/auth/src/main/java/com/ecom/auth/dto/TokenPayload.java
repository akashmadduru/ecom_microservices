package com.ecom.auth.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TokenPayload {
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
}
