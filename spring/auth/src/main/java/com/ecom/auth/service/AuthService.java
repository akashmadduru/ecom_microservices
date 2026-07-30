package com.ecom.auth.service;

import com.ecom.auth.config.AuthProperties;
import com.ecom.auth.domain.User;
import com.ecom.auth.dto.*;
import com.ecom.auth.exception.*;
import com.ecom.auth.repository.UserRepository;
import com.ecom.auth.security.SecurityService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class AuthService {
    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private final UserRepository userRepository;
    private final SecurityService securityService;
    private final SessionService sessionService;
    private final OAuth2GoogleService oAuth2GoogleService;
    private final AuthProperties authProperties;

    public AuthService(UserRepository userRepository, SecurityService securityService, SessionService sessionService, OAuth2GoogleService oAuth2GoogleService, AuthProperties authProperties) {
        this.userRepository = userRepository;
        this.securityService = securityService;
        this.sessionService = sessionService;
        this.oAuth2GoogleService = oAuth2GoogleService;
        this.authProperties = authProperties;
    }

    /**
     * Register a new user with username, email, and password.
     */
    @Transactional
    public UserResponse register(UserSignupRequest request) {
        String normalizedUsername = securityService.normalizeUsername(request.username());

        // Validate username length after normalization
        if (normalizedUsername.length() < 3) {
            throw new ValidationException("Username must be at least 3 characters");
        }

        // Validate password strength
        if (!securityService.isPasswordStrong(request.password())) {
            throw new ValidationException(
                "Password must be at least 8 characters and include uppercase, lowercase, number, and special character"
            );
        }

        // Check if username is taken
        if (userRepository.findByUsername(normalizedUsername).isPresent()) {
            throw new ConflictException("Username already registered");
        }

        // Check if email is taken (if provided)
        if (request.email() != null && !request.email().isBlank()) {
            if (userRepository.findByEmailIgnoreCase(request.email()).isPresent()) {
                throw new ConflictException("Email already registered");
            }
        }

        // Default role is USER
        String role = request.role() != null && !request.role().isBlank() ? request.role() : "USER";

        User user = User.builder()
            .username(normalizedUsername)
            .email(request.email())
            .passwordHash(securityService.hashPassword(request.password()))
            .role(role)
            .provider("local")
            .isActive(true)
            .build();

        user = userRepository.save(user);
        log.info("User registered: username={}, role={}", normalizedUsername, role);

        return mapUserToResponse(user);
    }

    /**
     * Authenticate a user by username and password.
     */
    @Transactional
    public UserResponse authenticate(String username, String password) {
        String normalizedUsername = securityService.normalizeUsername(username);

        User user = userRepository.findByUsername(normalizedUsername)
            .orElseThrow(() -> new UnauthorizedException("Incorrect username or password"));

        // Verify password exists and matches
        if (user.getPasswordHash() == null || !securityService.verifyPassword(password, user.getPasswordHash())) {
            throw new UnauthorizedException("Incorrect username or password");
        }

        // Verify user is active
        if (!user.getIsActive()) {
            throw new ForbiddenException("User is inactive");
        }

        return mapUserToResponse(user);
    }

    /**
     * Issue a token pair (access + refresh) for a user.
     */
    public TokenPairResponse issuePair(User user, String userAgent) {
        String sid = UUID.randomUUID().toString();

        // Create access token
        String[] accessTokenPair = securityService.createAccessToken(
            user.getId().toString(),
            user.getEmail(),
            user.getUsername(),
            user.getRole(),
            sid
        );
        String accessToken = accessTokenPair[0];

        // Create refresh token
        String[] refreshTokenPair = securityService.createRefreshToken(
            user.getId().toString(),
            sid
        );
        String refreshToken = refreshTokenPair[0];
        String refreshJti = refreshTokenPair[1];

        // Store session in Redis
        sessionService.createSession(sid, user.getId().toString(), refreshJti, userAgent);

        int accessTokenExpiry = authProperties.getAccessTokenExpireMinutes() * 60;

        return TokenPairResponse.builder()
            .accessToken(accessToken)
            .refreshToken(refreshToken)
            .expiresIn(accessTokenExpiry)
            .role(user.getRole())
            .build();
    }

    /**
     * Refresh tokens using a refresh token.
     */
    @Transactional
    public TokenPairResponse refreshTokens(String refreshToken) {
        // Verify the refresh token
        TokenPayload payload = securityService.verifyToken(refreshToken);

        // Check token type
        if (!"refresh".equals(payload.typ())) {
            throw new UnauthorizedException("Not a refresh token");
        }

        if (payload.sid() == null) {
            throw new UnauthorizedException("Malformed refresh token");
        }

        // Get the session
        Map<Object, Object> session = sessionService.getSession(payload.sid());
        if (session == null || session.isEmpty()) {
            throw new UnauthorizedException("Session expired or revoked");
        }

        // Check for refresh token reuse (reuse detection)
        Object currentJti = session.get("current_refresh_jti");
        if (currentJti == null || !currentJti.toString().equals(payload.jti())) {
            // Token was already rotated away - possible theft
            sessionService.destroySession(payload.sid());
            log.warn("Refresh token reuse detected: sid={}, user_id={}", payload.sid(), payload.sub());
            throw new UnauthorizedException("Refresh token reuse detected; session revoked");
        }

        // Get the user and verify they're still active
        User user = userRepository.findById(UUID.fromString(payload.sub()))
            .orElseThrow(() -> new UnauthorizedException("User not found"));

        if (!user.getIsActive()) {
            sessionService.destroySession(payload.sid());
            throw new UnauthorizedException("User no longer active");
        }

        // Create new access token (same session ID)
        String[] accessTokenPair = securityService.createAccessToken(
            user.getId().toString(),
            user.getEmail(),
            user.getUsername(),
            user.getRole(),
            payload.sid()
        );
        String accessToken = accessTokenPair[0];

        // Create new refresh token
        String[] refreshTokenPair = securityService.createRefreshToken(
            user.getId().toString(),
            payload.sid()
        );
        String newRefreshToken = refreshTokenPair[0];
        String newJti = refreshTokenPair[1];

        // Rotate the refresh token in Redis
        sessionService.rotateRefreshToken(payload.sid(), payload.jti(), newJti);

        int accessTokenExpiry = authProperties.getAccessTokenExpireMinutes() * 60;

        return TokenPairResponse.builder()
            .accessToken(accessToken)
            .refreshToken(newRefreshToken)
            .expiresIn(accessTokenExpiry)
            .role(user.getRole())
            .build();
    }

    /**
     * Logout: denylist the access token and destroy the session.
     */
    @Transactional
    public void logout(TokenPayload tokenPayload) {
        long remainingSeconds = tokenPayload.exp() - (System.currentTimeMillis() / 1000);
        sessionService.denylistAccessJti(tokenPayload.jti(), remainingSeconds);

        if (tokenPayload.sid() != null) {
            sessionService.destroySession(tokenPayload.sid());
        }
    }

    /**
     * Logout all: denylist the access token and destroy all sessions for the user.
     */
    @Transactional
    public long logoutAll(TokenPayload tokenPayload) {
        long remainingSeconds = tokenPayload.exp() - (System.currentTimeMillis() / 1000);
        sessionService.denylistAccessJti(tokenPayload.jti(), remainingSeconds);

        return sessionService.destroyAllSessions(tokenPayload.sub());
    }

    /**
     * SSO login: find or create a user by provider and subject.
     */
    @Transactional
    public UserResponse ssoLogin(SSOLoginRequest request) {
        String provider = request.provider().toLowerCase().trim();
        String subject = request.subject().trim();

        if (subject.isBlank()) {
            throw new ValidationException("SSO subject is required");
        }

        // Try to find existing user by provider + subject
        Optional<User> existingUser = userRepository.findByProviderAndProviderSub(provider, subject);

        if (existingUser.isPresent()) {
            User user = existingUser.get();
            if (!user.getIsActive()) {
                throw new ForbiddenException("User is inactive");
            }
            return mapUserToResponse(user);
        }

        // Create new user
        String displayName = request.displayName() != null ? request.displayName() : "";
        String baseUsername = displayName.replaceAll("\\s+", "").toLowerCase();
        if (baseUsername.isBlank()) {
            baseUsername = request.email() != null ? request.email().split("@")[0] : provider + "-" + subject;
        }
        baseUsername = baseUsername.substring(0, Math.min(40, baseUsername.length()));
        if (baseUsername.isBlank()) {
            baseUsername = "user";
        }

        // Find a unique username
        String username = findUniqueUsername(baseUsername);

        User newUser = User.builder()
            .username(username)
            .email(request.email())
            .passwordHash(null) // No password for SSO
            .role("USER")
            .provider(provider)
            .providerSub(subject)
            .isActive(true)
            .build();

        newUser = userRepository.save(newUser);
        log.info("SSO user created: username={}, provider={}", username, provider);

        return mapUserToResponse(newUser);
    }

    /**
     * Get a user by ID.
     */
    public UserResponse getUser(String userId) {
        User user = userRepository.findById(UUID.fromString(userId))
            .orElseThrow(() -> new NotFoundException("User not found"));
        return mapUserToResponse(user);
    }

    /**
     * Validate an access token and return its payload.
     */
    public TokenPayload validateToken(String token) {
        TokenPayload payload = securityService.verifyToken(token);

        // Check if token is denylisted
        if (sessionService.isAccessJtiDenylisted(payload.jti())) {
            throw new UnauthorizedException("Token has been revoked");
        }

        return payload;
    }

    /**
     * Create OAuth2 authorization URL for Google.
     */
    public String createGoogleAuthorizeUrl() {
        return oAuth2GoogleService.createAuthorizeUrl();
    }

    /**
     * Handle Google OAuth2 callback.
     */
    @Transactional
    public UserResponse handleGoogleCallback(String code, String state) {
        // Exchange code for ID token
        String idToken = oAuth2GoogleService.exchangeCode(code, state);

        // Verify the ID token
        Map<String, Object> claims = oAuth2GoogleService.verifyGoogleIdToken(idToken);

        // Extract Google profile
        Map<String, String> profile = oAuth2GoogleService.extractGoogleProfile(claims);

        // SSO login
        SSOLoginRequest ssoRequest = SSOLoginRequest.builder()
            .provider("google")
            .subject(profile.get("subject"))
            .email(profile.get("email"))
            .displayName(profile.get("display_name"))
            .build();

        return ssoLogin(ssoRequest);
    }

    /**
     * Google ID token login (direct).
     */
    @Transactional
    public UserResponse ssoGoogleLogin(String idToken) {
        // Verify the ID token
        Map<String, Object> claims = oAuth2GoogleService.verifyGoogleIdToken(idToken);

        // Extract Google profile
        Map<String, String> profile = oAuth2GoogleService.extractGoogleProfile(claims);

        // SSO login
        SSOLoginRequest ssoRequest = SSOLoginRequest.builder()
            .provider("google")
            .subject(profile.get("subject"))
            .email(profile.get("email"))
            .displayName(profile.get("display_name"))
            .build();

        return ssoLogin(ssoRequest);
    }

    private String findUniqueUsername(String baseUsername) {
        String username = baseUsername;
        int suffix = 1;

        while (userRepository.findByUsername(username).isPresent()) {
            username = baseUsername + suffix;
            suffix++;
        }

        return username;
    }

    private UserResponse mapUserToResponse(User user) {
        return UserResponse.builder()
            .id(user.getId())
            .username(user.getUsername())
            .email(user.getEmail())
            .role(user.getRole())
            .provider(user.getProvider())
            .isActive(user.getIsActive())
            .createdAt(user.getCreatedAt())
            .updatedAt(user.getUpdatedAt())
            .build();
    }
}
