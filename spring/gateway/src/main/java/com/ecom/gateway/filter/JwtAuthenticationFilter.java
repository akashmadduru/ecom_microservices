package com.ecom.gateway.filter;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GatewayFilter;
import org.springframework.cloud.gateway.filter.factory.AbstractGatewayFilterFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;

import javax.crypto.SecretKey;
import java.util.Arrays;
import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends AbstractGatewayFilterFactory<JwtAuthenticationFilter.Config> {

    @Value("${auth.jwt-secret:your-secret-key-change-in-production-min-256-bits-long-key-here-make-it-secure}")
    private String jwtSecret;

    @Value("${auth.jwt-issuer:auth-service}")
    private String jwtIssuer;

    @Value("${auth.jwt-audience:ecom-api}")
    private String jwtAudience;

    private static final List<String> EXCLUDED_PATHS = Arrays.asList(
        "/api/v1/auth/signup",
        "/api/v1/auth/signin",
        "/api/v1/auth/sso/google/authorize",
        "/api/v1/auth/sso/google/callback",
        "/api/v1/auth/sso/google",
        "/api/v1/auth/sso/login",
        "/api/v1/auth/token/refresh",
        "/actuator/health",
        "/swagger-ui",
        "/v3/api-docs"
    );

    @Override
    public GatewayFilter apply(Config config) {
        return (exchange, chain) -> {
            String path = exchange.getRequest().getURI().getPath();

            if (isExcludedPath(path)) {
                return chain.filter(exchange);
            }

            String token = extractToken(exchange);
            if (token == null || token.isEmpty()) {
                log.debug("Missing token for path: {}", path);
                exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
                return exchange.getResponse().setComplete();
            }

            try {
                Claims claims = verifyToken(token);
                String userId = claims.getSubject();
                String username = (String) claims.get("username");
                String role = (String) claims.get("role");

                ServerWebExchange modifiedExchange = exchange.mutate()
                    .request(exchange.getRequest().mutate()
                        .header("X-User-ID", userId)
                        .header("X-Username", username)
                        .header("X-User-Role", role)
                        .build())
                    .build();

                return chain.filter(modifiedExchange);
            } catch (JwtException | IllegalArgumentException e) {
                log.debug("Token validation failed: {}", e.getMessage());
                exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
                return exchange.getResponse().setComplete();
            }
        };
    }

    private String extractToken(ServerWebExchange exchange) {
        String authHeader = exchange.getRequest().getHeaders().getFirst(HttpHeaders.AUTHORIZATION);
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            return authHeader.substring(7);
        }
        return null;
    }

    private Claims verifyToken(String token) {
        return Jwts.parser()
            .verifyWith(getSigningKey())
            .build()
            .parseSignedClaims(token)
            .getPayload();
    }

    private SecretKey getSigningKey() {
        return Keys.hmacShaKeyFor(jwtSecret.getBytes());
    }

    private boolean isExcludedPath(String path) {
        return EXCLUDED_PATHS.stream().anyMatch(path::startsWith);
    }

    public static class Config {
    }
}
