package com.ecom.auth.service;

import com.ecom.auth.config.AuthProperties;
import com.ecom.auth.exception.UnauthorizedException;
import com.google.auth.oauth2.TokenVerifier;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.*;


@Slf4j
@Service
@RequiredArgsConstructor
public class OAuth2GoogleService {

    private final AuthProperties authProperties;
    private final SessionService sessionService;
    private final WebClient.Builder webClientBuilder;

    private static final String GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
    private static final String GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
    private static final String GOOGLE_CERTS_ENDPOINT = "https://www.googleapis.com/oauth2/v1/certs";

    private static final int STATE_TTL_SECONDS = 600;

    /**
     * Generate the authorization URL for the OAuth2 authorization-code flow.
     */
    public String createAuthorizeUrl() {
        String state = generateState();
        sessionService.storeOAuthState(state);

        Map<String, String> params = new LinkedHashMap<>();
        params.put("client_id", authProperties.getGoogleOAuth2ClientId());
        params.put("redirect_uri", authProperties.getGoogleOAuth2RedirectUri());
        params.put("response_type", "code");
        params.put("scope", "openid email profile");
        params.put("state", state);
        params.put("access_type", "offline");
        params.put("prompt", "select_account");

        String query = buildQuery(params);
        return GOOGLE_AUTH_ENDPOINT + "?" + query;
    }

    /**
     * Exchange the authorization code for an ID token.
     * Validates the CSRF state first.
     */
    public String exchangeCode(String code, String state) {
        if (!sessionService.validateAndConsumeOAuthState(state)) {
            throw new UnauthorizedException("Invalid or expired OAuth state");
        }

        WebClient webClient = webClientBuilder.build();
        Map<String, String> requestBody = new LinkedHashMap<>();
        requestBody.put("client_id", authProperties.getGoogleOAuth2ClientId());
        requestBody.put("client_secret", authProperties.getGoogleOAuth2ClientSecret());
        requestBody.put("code", code);
        requestBody.put("grant_type", "authorization_code");
        requestBody.put("redirect_uri", authProperties.getGoogleOAuth2RedirectUri());

        try {
            Map<String, Object> response = webClient.post()
                .uri(GOOGLE_TOKEN_ENDPOINT)
                .bodyValue(requestBody)
                .retrieve()
                .bodyToMono(Map.class)
                .timeout(java.time.Duration.ofSeconds(10))
                .block();

            if (response == null || !response.containsKey("id_token")) {
                throw new UnauthorizedException("Google response missing id_token");
            }

            return (String) response.get("id_token");
        } catch (Exception e) {
            log.error("Google token endpoint error", e);
            throw new UnauthorizedException("Google code exchange failed: " + e.getMessage(), e);
        }
    }

    /**
     * Verify a Google ID token using google-auth-library.
     * Returns the token claims as a map.
     */
    public Map<String, Object> verifyGoogleIdToken(String token) {
        try {
            TokenVerifier verifier = TokenVerifier.newBuilder()
                .setCertificatesLocation(GOOGLE_CERTS_ENDPOINT)
                .build();

            // The verify method returns a JsonWebSignature
            Object verified = verifier.verify(token);

            // Parse the JWT to extract claims
            String[] parts = token.split("\\.");
            if (parts.length != 3) {
                throw new UnauthorizedException("Invalid JWT format");
            }

            // Decode the payload (second part)
            String payload = parts[1];
            // Add padding if needed
            while (payload.length() % 4 != 0) {
                payload += "=";
            }

            byte[] decodedBytes = Base64.getUrlDecoder().decode(payload);
            String jsonPayload = new String(decodedBytes);

            // Parse JSON manually or use a simple JSON parser
            // For now, we'll use a basic approach with string parsing
            // A production app would use Jackson or similar
            Map<String, Object> claims = parseJwtPayload(jsonPayload);

            // Verify audience (client ID)
            Object audValue = claims.get("aud");
            boolean audienceValid = false;

            if (audValue instanceof String && audValue.equals(authProperties.getGoogleOAuth2ClientId())) {
                audienceValid = true;
            } else if (audValue instanceof List) {
                List<?> audiences = (List<?>) audValue;
                for (Object aud : audiences) {
                    if (aud.toString().equals(authProperties.getGoogleOAuth2ClientId())) {
                        audienceValid = true;
                        break;
                    }
                }
            }

            if (!audienceValid) {
                throw new UnauthorizedException("Invalid audience in Google token");
            }

            return claims;
        } catch (Exception e) {
            log.error("Google token verification failed", e);
            throw new UnauthorizedException("Invalid Google token: " + e.getMessage(), e);
        }
    }

    /**
     * Simple JWT payload parser. A production application should use Jackson or similar.
     */
    private Map<String, Object> parseJwtPayload(String jsonPayload) {
        // For this MVP, we'll do basic parsing
        // A real implementation would use Jackson
        Map<String, Object> claims = new HashMap<>();

        // Extract basic fields using regex
        extractStringField(jsonPayload, "sub", claims);
        extractStringField(jsonPayload, "email", claims);
        extractStringField(jsonPayload, "given_name", claims);
        extractStringField(jsonPayload, "family_name", claims);
        extractStringField(jsonPayload, "name", claims);

        // Parse aud field (can be string or array)
        if (jsonPayload.contains("\"aud\":\"")) {
            String aud = extractQuotedField(jsonPayload, "aud");
            if (aud != null) {
                claims.put("aud", aud);
            }
        } else if (jsonPayload.contains("\"aud\":[")) {
            // Parse array
            int start = jsonPayload.indexOf("\"aud\":[") + 8;
            int end = jsonPayload.indexOf("]", start);
            String audArray = jsonPayload.substring(start, end);
            List<String> auds = new ArrayList<>();
            for (String aud : audArray.split(",")) {
                String trimmed = aud.trim().replaceAll("\"", "");
                if (!trimmed.isEmpty()) {
                    auds.add(trimmed);
                }
            }
            claims.put("aud", auds);
        }

        return claims;
    }

    private void extractStringField(String json, String fieldName, Map<String, Object> claims) {
        String pattern = "\"" + fieldName + "\":\"";
        int start = json.indexOf(pattern);
        if (start >= 0) {
            start += pattern.length();
            int end = json.indexOf("\"", start);
            if (end > start) {
                claims.put(fieldName, json.substring(start, end));
            }
        }
    }

    private String extractQuotedField(String json, String fieldName) {
        String pattern = "\"" + fieldName + "\":\"";
        int start = json.indexOf(pattern);
        if (start >= 0) {
            start += pattern.length();
            int end = json.indexOf("\"", start);
            if (end > start) {
                return json.substring(start, end);
            }
        }
        return null;
    }

    /**
     * Extract Google profile information from token claims.
     */
    public Map<String, String> extractGoogleProfile(Map<String, Object> claims) {
        String email = (String) claims.getOrDefault("email", "");
        email = email.trim().toLowerCase();

        String givenName = (String) claims.getOrDefault("given_name", "");
        givenName = givenName.trim();

        String familyName = (String) claims.getOrDefault("family_name", "");
        familyName = familyName.trim();

        String displayName = (givenName + " " + familyName).trim();
        if (displayName.isEmpty()) {
            displayName = email.split("@", 2)[0];
        }

        Map<String, String> profile = new HashMap<>();
        profile.put("subject", String.valueOf(claims.getOrDefault("sub", "")));
        profile.put("email", email);
        profile.put("display_name", displayName);
        profile.put("provider", "google");

        return profile;
    }

    private String generateState() {
        byte[] randomBytes = new byte[32];
        new SecureRandom().nextBytes(randomBytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(randomBytes);
    }

    private String buildQuery(Map<String, String> params) {
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, String> entry : params.entrySet()) {
            if (sb.length() > 0) {
                sb.append("&");
            }
            sb.append(URLEncoder.encode(entry.getKey(), StandardCharsets.UTF_8))
                .append("=")
                .append(URLEncoder.encode(entry.getValue(), StandardCharsets.UTF_8));
        }
        return sb.toString();
    }
}
