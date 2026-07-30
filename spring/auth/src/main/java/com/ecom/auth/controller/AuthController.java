package com.ecom.auth.controller;

import com.ecom.auth.dto.*;
import com.ecom.auth.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.view.RedirectView;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/signup")
    public ResponseEntity<UserResponse> signup(@Valid @RequestBody UserSignupRequest request) {
        UserResponse user = authService.register(request);
        return new ResponseEntity<>(user, HttpStatus.CREATED);
    }

    @PostMapping("/signin")
    public ResponseEntity<TokenPairResponse> signin(
        @Valid @RequestBody SigninRequest request,
        HttpServletRequest httpRequest) {
        UserResponse user = authService.authenticate(request.username(), request.password());
        TokenPairResponse tokens = authService.issuePair(
            convertToUserEntity(user),
            httpRequest.getHeader("User-Agent")
        );
        return ResponseEntity.ok(tokens);
    }

    @PostMapping("/token/refresh")
    public ResponseEntity<TokenPairResponse> refreshTokens(@Valid @RequestBody RefreshTokenRequest request) {
        TokenPairResponse tokens = authService.refreshTokens(request.refreshToken());
        return ResponseEntity.ok(tokens);
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@RequestHeader("Authorization") String authHeader) {
        String token = extractToken(authHeader);
        TokenPayload payload = authService.validateToken(token);
        authService.logout(payload);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/logout/all")
    public ResponseEntity<Map<String, Long>> logoutAll(@RequestHeader("Authorization") String authHeader) {
        String token = extractToken(authHeader);
        TokenPayload payload = authService.validateToken(token);
        long revokedSessions = authService.logoutAll(payload);
        return ResponseEntity.ok(Map.of("revoked_sessions", revokedSessions));
    }

    @PostMapping("/sso/google")
    public ResponseEntity<TokenPairResponse> ssoGoogleLogin(
        @Valid @RequestBody GoogleLoginRequest request,
        HttpServletRequest httpRequest) {
        UserResponse user = authService.ssoGoogleLogin(request.token());
        TokenPairResponse tokens = authService.issuePair(
            convertToUserEntity(user),
            httpRequest.getHeader("User-Agent")
        );
        return ResponseEntity.ok(tokens);
    }

    @GetMapping("/sso/google/authorize")
    public RedirectView ssoGoogleAuthorize() {
        String authorizeUrl = authService.createGoogleAuthorizeUrl();
        return new RedirectView(authorizeUrl);
    }

    @GetMapping("/sso/google/callback")
    public ResponseEntity<TokenPairResponse> ssoGoogleCallback(
        @RequestParam String code,
        @RequestParam String state,
        HttpServletRequest httpRequest) {
        UserResponse user = authService.handleGoogleCallback(code, state);
        TokenPairResponse tokens = authService.issuePair(
            convertToUserEntity(user),
            httpRequest.getHeader("User-Agent")
        );
        return ResponseEntity.ok(tokens);
    }

    @PostMapping("/sso/login")
    public ResponseEntity<TokenPairResponse> ssoLogin(
        @Valid @RequestBody SSOLoginRequest request,
        HttpServletRequest httpRequest) {
        UserResponse user = authService.ssoLogin(request);
        TokenPairResponse tokens = authService.issuePair(
            convertToUserEntity(user),
            httpRequest.getHeader("User-Agent")
        );
        return ResponseEntity.ok(tokens);
    }

    @GetMapping("/validate")
    public ResponseEntity<UserResponse> validateToken(@RequestHeader("Authorization") String authHeader) {
        String token = extractToken(authHeader);
        TokenPayload payload = authService.validateToken(token);
        UserResponse user = authService.getUser(payload.sub());
        return ResponseEntity.ok(user);
    }

    @GetMapping("/users/me")
    public ResponseEntity<UserResponse> getCurrentUser(@RequestHeader("Authorization") String authHeader) {
        String token = extractToken(authHeader);
        TokenPayload payload = authService.validateToken(token);
        UserResponse user = authService.getUser(payload.sub());
        return ResponseEntity.ok(user);
    }

    @GetMapping("/internal/users/{user_id}")
    public ResponseEntity<UserResponse> getUser(@PathVariable String userId) {
        UserResponse user = authService.getUser(userId);
        return ResponseEntity.ok(user);
    }

    private String extractToken(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            throw new com.ecom.auth.exception.UnauthorizedException("Missing or invalid Authorization header");
        }
        return authHeader.substring(7);
    }

    private com.ecom.auth.domain.User convertToUserEntity(UserResponse userResponse) {
        return com.ecom.auth.domain.User.builder()
            .id(userResponse.id())
            .username(userResponse.username())
            .email(userResponse.email())
            .role(userResponse.role())
            .provider(userResponse.provider())
            .isActive(userResponse.isActive())
            .build();
    }
}
