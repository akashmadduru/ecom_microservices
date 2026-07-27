package com.ecom.auth.security;

public class TokenPayload {
    private String sub;          // user_id
    private String email;
    private String username;
    private String role;
    private String sid;          // session_id
    private String jti;          // JWT ID (token ID)
    private Long exp;            // expiration time
    private Long iat;            // issued at
    private String iss;          // issuer
    private String aud;          // audience
    private String typ;          // type (Bearer)

    public TokenPayload() {}

    public TokenPayload(String sub, String email, String username, String role, String sid, String jti, Long exp, Long iat, String iss, String aud) {
        this.sub = sub;
        this.email = email;
        this.username = username;
        this.role = role;
        this.sid = sid;
        this.jti = jti;
        this.exp = exp;
        this.iat = iat;
        this.iss = iss;
        this.aud = aud;
        this.typ = "Bearer";
    }

    // Getters
    public String getSub() {
        return sub;
    }

    public String getEmail() {
        return email;
    }

    public String getUsername() {
        return username;
    }

    public String getRole() {
        return role;
    }

    public String getSid() {
        return sid;
    }

    public String getJti() {
        return jti;
    }

    public Long getExp() {
        return exp;
    }

    public Long getIat() {
        return iat;
    }

    public String getIss() {
        return iss;
    }

    public String getAud() {
        return aud;
    }

    public String getTyp() {
        return typ;
    }
}
