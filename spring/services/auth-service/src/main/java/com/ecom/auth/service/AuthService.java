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
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Service
@Transactional
public class AuthService {
    private final UserRepository userRepository;
    private final JwtTokenProvider jwtTokenProvider;
    private final PasswordEncoder passwordEncoder;

    public AuthService(UserRepository userRepository,
                      JwtTokenProvider jwtTokenProvider,
                      PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.jwtTokenProvider = jwtTokenProvider;
        this.passwordEncoder = passwordEncoder;
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

            // Verify user still exists
            Optional<User> userOpt = userRepository.findById(payload.getSub());
            if (userOpt.isEmpty()) {
                throw new InvalidTokenException("User not found");
            }

            User user = userOpt.get();
            return mintTokenPair(user);
        } catch (JwtProcessingException e) {
            throw new InvalidTokenException(e.getMessage());
        }
    }

    public TokenPayload validateToken(String token) {
        try {
            TokenPayload payload = jwtTokenProvider.validateToken(token);

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
            String accessToken = jwtTokenProvider.mintAccessToken(
                    user.getId(),
                    user.getEmail(),
                    user.getUsername(),
                    user.getRole(),
                    "");

            String refreshToken = jwtTokenProvider.mintRefreshToken(
                    user.getId(),
                    user.getRole(),
                    "");

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
