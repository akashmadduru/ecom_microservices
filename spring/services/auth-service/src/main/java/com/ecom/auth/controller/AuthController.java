package com.ecom.auth.controller;

import com.ecom.auth.dto.RefreshTokenRequest;
import com.ecom.auth.dto.TokenPairResponse;
import com.ecom.auth.dto.UserLoginRequest;
import com.ecom.auth.dto.UserResponse;
import com.ecom.auth.dto.UserSignupRequest;
import com.ecom.auth.model.User;
import com.ecom.auth.security.TokenPayload;
import com.ecom.auth.service.AuthService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.validation.Valid;

@RestController
@RequestMapping("/auth")
public class AuthController {
    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/signup")
    public ResponseEntity<UserResponse> signup(@Valid @RequestBody UserSignupRequest request) {
        User user = authService.signup(request.getUsername(), request.getEmail(), request.getPassword());
        UserResponse response = new UserResponse(
                user.getId(),
                user.getUsername(),
                user.getEmail(),
                user.getRole(),
                user.getProvider(),
                user.getIsActive());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PostMapping("/login")
    public ResponseEntity<TokenPairResponse> login(@Valid @RequestBody UserLoginRequest request) {
        TokenPairResponse response = authService.login(request.getEmail(), request.getPassword());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/refresh")
    public ResponseEntity<TokenPairResponse> refresh(@Valid @RequestBody RefreshTokenRequest request) {
        TokenPairResponse response = authService.refresh(request.getRefreshToken());
        return ResponseEntity.ok(response);
    }

    @GetMapping("/validate")
    public ResponseEntity<UserResponse> validate(@RequestHeader("Authorization") String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        String token = authHeader.substring(7);
        TokenPayload payload = authService.validateToken(token);

        UserResponse response = new UserResponse(
                payload.getSub(),
                payload.getUsername(),
                payload.getEmail(),
                payload.getRole(),
                "local",
                true);
        return ResponseEntity.ok(response);
    }
}
