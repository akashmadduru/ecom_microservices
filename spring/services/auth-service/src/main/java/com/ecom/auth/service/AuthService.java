package com.ecom.auth.service;

import com.ecom.auth.dto.TokenPairResponse;
import com.ecom.auth.exception.InvalidCredentialsException;
import com.ecom.auth.exception.InvalidTokenException;
import com.ecom.auth.exception.UserConflictException;
import com.ecom.auth.model.User;
import com.ecom.auth.repository.UserRepository;
import com.ecom.auth.security.JwtProcessingException;
import com.ecom.auth.security.JwtTokenProvider;
import com.ecom.auth.security.TokenPayload;
import com.ecom.auth.session.SessionStore;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

@Service
@Transactional
public class AuthService {
    private final UserRepository userRepository;
    private final JwtTokenProvider jwtTokenProvider;
    private final PasswordEncoder passwordEncoder;
    private final SessionStore sessionStore;

    public AuthService(UserRepository userRepository,
                      JwtTokenProvider jwtTokenProvider,
                      PasswordEncoder passwordEncoder,
                      SessionStore sessionStore) {
        this.userRepository = userRepository;
        this.jwtTokenProvider = jwtTokenProvider;
        this.passwordEncoder = passwordEncoder;
        this.sessionStore = sessionStore;
    }

    public User signup(String username, String email, String password) {
        if (userRepository.existsByUsername(username)) {
            throw new UserConflictException("Username already exists", "username");
        }

        if (userRepository.existsByEmail(email)) {
            throw new UserConflictException("Email already exists", "email");
        }

        String passwordHash = passwordEncoder.encode(password);
        User user = new User(username, email, passwordHash);
        return userRepository.save(user);
    }

    public TokenPairResponse login(String email, String password) {
        Optional<User> userOpt = userRepository.findByEmail(email);
        if (userOpt.isEmpty()) {
            throw new InvalidCredentialsException("Email or password is incorrect");
        }

        User user = userOpt.get();
        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            throw new InvalidCredentialsException("Email or password is incorrect");
        }

        return mintTokenPair(user);
    }

    public TokenPairResponse refresh(String refreshToken) {
        try {
            TokenPayload payload = jwtTokenProvider.validateToken(refreshToken);

            // Check if token is denylisted
            if (sessionStore.isTokenDenylisted(payload.getJti())) {
                throw new InvalidTokenException("Refresh token has been revoked");
            }

            // Get the session
            String sessionId = payload.getSid();
            if (sessionId == null || sessionStore.getSession(sessionId) == null) {
                throw new InvalidTokenException("Session not found or expired");
            }

            // Verify user still exists
            Optional<User> userOpt = userRepository.findById(payload.getSub());
            if (userOpt.isEmpty()) {
                throw new InvalidTokenException("User not found");
            }

            User user = userOpt.get();

            // Add old refresh token to denylist
            int refreshTtl = jwtTokenProvider.getRefreshTokenExpirationSeconds();
            sessionStore.addTokenToDenylist(payload.getJti(), refreshTtl);

            // Generate new tokens
            return mintTokenPair(user);
        } catch (JwtProcessingException e) {
            throw new InvalidTokenException(e.getMessage());
        }
    }

    public TokenPayload validateToken(String token) {
        try {
            TokenPayload payload = jwtTokenProvider.validateToken(token);

            // Check if token is denylisted
            if (sessionStore.isTokenDenylisted(payload.getJti())) {
                throw new InvalidTokenException("Token has been revoked");
            }

            // Verify user still exists
            Optional<User> userOpt = userRepository.findById(payload.getSub());
            if (userOpt.isEmpty()) {
                throw new InvalidTokenException("User not found");
            }

            return payload;
        } catch (JwtProcessingException e) {
            throw new InvalidTokenException(e.getMessage());
        }
    }

    private TokenPairResponse mintTokenPair(User user) {
        try {
            String sessionId = UUID.randomUUID().toString();
            String accessToken = jwtTokenProvider.mintAccessToken(
                    user.getId(),
                    user.getEmail(),
                    user.getUsername(),
                    user.getRole(),
                    sessionId);

            String refreshToken = jwtTokenProvider.mintRefreshToken(
                    user.getId(),
                    user.getRole(),
                    sessionId);

            // Extract JTI from refresh token for session storage
            TokenPayload refreshPayload = jwtTokenProvider.validateToken(refreshToken);
            String refreshJti = refreshPayload.getJti();

            // Store session in Redis
            int refreshTtl = jwtTokenProvider.getRefreshTokenExpirationSeconds();
            sessionStore.storeSession(sessionId, user.getId(), refreshJti, "", refreshTtl);

            int accessTtl = jwtTokenProvider.getAccessTokenExpirationSeconds();
            return new TokenPairResponse(
                    accessToken,
                    refreshToken,
                    "Bearer",
                    accessTtl);
        } catch (JwtProcessingException e) {
            throw new RuntimeException("Failed to mint tokens", e);
        }
    }
}
