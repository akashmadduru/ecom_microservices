package com.ecom.auth.security;

import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.crypto.MACVerifier;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.text.ParseException;
import java.util.Date;
import java.util.UUID;

@Component
public class JwtTokenProvider {
    private final String jwtSecret;
    private final String jwtAlgorithm;
    private final String jwtIssuer;
    private final String jwtAudience;
    private final int accessTokenExpirationSeconds;
    private final int refreshTokenExpirationSeconds;
    private final JWSSigner signer;
    private final JWSVerifier verifier;

    public JwtTokenProvider(
            @Value("${auth.jwt.secret}") String jwtSecret,
            @Value("${auth.jwt.algorithm:HS256}") String jwtAlgorithm,
            @Value("${auth.jwt.issuer:ecom-auth-service}") String jwtIssuer,
            @Value("${auth.jwt.audience:ecom-api}") String jwtAudience,
            @Value("${auth.jwt.access-token-expiration:900}") int accessTokenExpirationSeconds,
            @Value("${auth.jwt.refresh-token-expiration:604800}") int refreshTokenExpirationSeconds) {
        this.jwtSecret = jwtSecret;
        this.jwtAlgorithm = jwtAlgorithm;
        this.jwtIssuer = jwtIssuer;
        this.jwtAudience = jwtAudience;
        this.accessTokenExpirationSeconds = accessTokenExpirationSeconds;
        this.refreshTokenExpirationSeconds = refreshTokenExpirationSeconds;

        try {
            byte[] secretBytes = jwtSecret.getBytes(StandardCharsets.UTF_8);
            this.signer = new MACSigner(secretBytes);
            this.verifier = new MACVerifier(secretBytes);
        } catch (JOSEException e) {
            throw new RuntimeException("Failed to initialize JWT signer/verifier", e);
        }
    }

    public String mintAccessToken(String userId, String email, String username, String role, String sessionId) throws JwtProcessingException {
        try {
            String jti = generateJti();
            long nowMillis = System.currentTimeMillis();
            Date now = new Date(nowMillis);
            Date expiryDate = new Date(nowMillis + accessTokenExpirationSeconds * 1000L);

            JWTClaimsSet claimsSet = new JWTClaimsSet.Builder()
                    .subject(userId)
                    .claim("email", email)
                    .claim("username", username)
                    .claim("role", role)
                    .claim("sid", sessionId)
                    .claim("jti", jti)
                    .issuer(jwtIssuer)
                    .audience(jwtAudience)
                    .expirationTime(expiryDate)
                    .issueTime(now)
                    .build();

            SignedJWT signedJWT = new SignedJWT(
                    new JWSHeader(JWSAlgorithm.HS256),
                    claimsSet);

            signedJWT.sign(signer);
            return signedJWT.serialize();
        } catch (JOSEException e) {
            throw new JwtProcessingException("Failed to mint access token", e);
        }
    }

    public String mintRefreshToken(String userId, String role, String sessionId) throws JwtProcessingException {
        try {
            String jti = generateJti();
            long nowMillis = System.currentTimeMillis();
            Date now = new Date(nowMillis);
            Date expiryDate = new Date(nowMillis + refreshTokenExpirationSeconds * 1000L);

            JWTClaimsSet claimsSet = new JWTClaimsSet.Builder()
                    .subject(userId)
                    .claim("role", role)
                    .claim("sid", sessionId)
                    .claim("jti", jti)
                    .issuer(jwtIssuer)
                    .audience(jwtAudience)
                    .expirationTime(expiryDate)
                    .issueTime(now)
                    .build();

            SignedJWT signedJWT = new SignedJWT(
                    new JWSHeader(JWSAlgorithm.HS256),
                    claimsSet);

            signedJWT.sign(signer);
            return signedJWT.serialize();
        } catch (JOSEException e) {
            throw new JwtProcessingException("Failed to mint refresh token", e);
        }
    }

    public TokenPayload validateToken(String token) throws JwtProcessingException {
        try {
            SignedJWT signedJWT = SignedJWT.parse(token);

            if (!signedJWT.verify(verifier)) {
                throw new JwtProcessingException("Invalid JWT signature");
            }

            JWTClaimsSet claimsSet = signedJWT.getJWTClaimsSet();

            if (claimsSet.getExpirationTime() != null &&
                new Date().after(claimsSet.getExpirationTime())) {
                throw new JwtProcessingException("JWT token has expired");
            }

            String sub = claimsSet.getSubject();
            String email = (String) claimsSet.getClaim("email");
            String username = (String) claimsSet.getClaim("username");
            String role = (String) claimsSet.getClaim("role");
            String sid = (String) claimsSet.getClaim("sid");
            String jti = (String) claimsSet.getClaim("jti");
            Long exp = claimsSet.getExpirationTime() != null ? claimsSet.getExpirationTime().getTime() / 1000 : null;
            Long iat = claimsSet.getIssueTime() != null ? claimsSet.getIssueTime().getTime() / 1000 : null;
            String iss = claimsSet.getIssuer();
            String aud = claimsSet.getAudience() != null && !claimsSet.getAudience().isEmpty()
                    ? claimsSet.getAudience().get(0) : null;

            return new TokenPayload(sub, email, username, role, sid, jti, exp, iat, iss, aud);
        } catch (JwtProcessingException e) {
            throw e;
        } catch (ParseException | JOSEException e) {
            throw new JwtProcessingException("Failed to validate JWT token: " + e.getMessage(), e);
        }
    }

    public String generateJti() {
        return UUID.randomUUID().toString();
    }

    public int getAccessTokenExpirationSeconds() {
        return accessTokenExpirationSeconds;
    }

    public int getRefreshTokenExpirationSeconds() {
        return refreshTokenExpirationSeconds;
    }
}
