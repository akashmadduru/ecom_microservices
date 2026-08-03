package com.ecom.auth.security;

import com.ecom.auth.config.AuthProperties;
import com.ecom.auth.dto.TokenPayload;
import com.ecom.auth.exception.UnauthorizedException;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;
import java.util.regex.Pattern;


@Slf4j
@Service
@RequiredArgsConstructor
public class SecurityService {

    private final AuthProperties authProperties;

    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    private static final Pattern PASSWORD_PATTERN =
        Pattern.compile("^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{8,}$");

    /**
     * Create an access token for the given user.
     * Returns a tuple of (token, jti).
     */
    public String[] createAccessToken(String userId, String email, String username, String role, String sid) {
        String jti = UUID.randomUUID().toString();
        Instant now = Instant.now();
        long expirySeconds = authProperties.getAccessTokenExpireMinutes() * 60L;

        String token = Jwts.builder()
            .subject(userId)
            .claim("username", username)
            .claim("email", email)
            .claim("role", role)
            .claim("sid", sid)
            .claim("typ", "access")
            .claim("jti", jti)
            .issuedAt(Date.from(now))
            .notBefore(Date.from(now))
            .expiration(Date.from(now.plusSeconds(expirySeconds)))
            .issuer(authProperties.getJwtIssuer())
            .audience().add(authProperties.getJwtAudience()).and()
            .signWith(getSigningKey(), SignatureAlgorithm.HS256)
            .compact();

        return new String[]{token, jti};
    }

    /**
     * Create a refresh token for the given user.
     * Returns a tuple of (token, jti).
     */
    public String[] createRefreshToken(String userId, String sid) {
        String jti = UUID.randomUUID().toString();
        Instant now = Instant.now();
        long expirySeconds = authProperties.getRefreshTokenExpireDays() * 86400L;

        String token = Jwts.builder()
            .subject(userId)
            .claim("sid", sid)
            .claim("typ", "refresh")
            .claim("jti", jti)
            .issuedAt(Date.from(now))
            .notBefore(Date.from(now))
            .expiration(Date.from(now.plusSeconds(expirySeconds)))
            .issuer(authProperties.getJwtIssuer())
            .audience().add(authProperties.getJwtAudience()).and()
            .signWith(getSigningKey(), SignatureAlgorithm.HS256)
            .compact();

        return new String[]{token, jti};
    }

    /**
     * Verify and parse a token, returning its claims.
     */
    public TokenPayload verifyToken(String token) {
        try {
            Claims claims = Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();

            return TokenPayload.builder()
                .sub(claims.getSubject())
                .username((String) claims.get("username"))
                .email((String) claims.get("email"))
                .role((String) claims.get("role"))
                .sid((String) claims.get("sid"))
                .jti((String) claims.get("jti"))
                .typ((String) claims.get("typ"))
                .exp(claims.getExpiration().getTime() / 1000)
                .iat(claims.getIssuedAt().getTime() / 1000)
                .nbf(claims.getNotBefore().getTime() / 1000)
                .iss(claims.getIssuer())
                .aud(claims.getAudience().isEmpty() ? null : claims.getAudience().iterator().next())
                .build();
        } catch (Exception e) {
            throw new UnauthorizedException("Invalid or expired token: " + e.getMessage(), e);
        }
    }

    /**
     * Hash a password using bcrypt.
     */
    public String hashPassword(String plainPassword) {
        return passwordEncoder.encode(plainPassword);
    }

    /**
     * Verify a plain password against its hash.
     */
    public boolean verifyPassword(String plainPassword, String hash) {
        return passwordEncoder.matches(plainPassword, hash);
    }

    /**
     * Check if a password meets policy requirements.
     */
    public boolean isPasswordStrong(String password) {
        return password != null && PASSWORD_PATTERN.matcher(password).matches();
    }

    /**
     * Normalize a username (lowercase, trimmed).
     */
    public String normalizeUsername(String username) {
        return username.trim().toLowerCase();
    }

    private SecretKey getSigningKey() {
        return Keys.hmacShaKeyFor(authProperties.getJwtSecret().getBytes());
    }
}
