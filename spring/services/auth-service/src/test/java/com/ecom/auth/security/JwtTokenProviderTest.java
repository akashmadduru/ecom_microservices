package com.ecom.auth.security;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class JwtTokenProviderTest {

    private JwtTokenProvider provider;
    private static final String SECRET = "test-secret-key-min-32-chars-long!";

    @BeforeEach
    void setUp() {
        provider = new JwtTokenProvider(SECRET, "HS256", "test-issuer", "test-audience", 900, 604800);
    }

    // Test 1: Happy Path - Mint Access Token
    @Test
    void test01_MintAccessToken_Success() throws Exception {
        String token = provider.mintAccessToken("user-1", "user@example.com", "username", "CUSTOMER", "session-1");
        assertNotNull(token);
        assertTrue(token.contains("."));
    }

    // Test 2: Happy Path - Mint Refresh Token
    @Test
    void test02_MintRefreshToken_Success() throws Exception {
        String token = provider.mintRefreshToken("user-1", "CUSTOMER", "session-1");
        assertNotNull(token);
        assertTrue(token.contains("."));
    }

    // Test 3: Happy Path - Validate Token
    @Test
    void test03_ValidateToken_Success() throws Exception {
        String token = provider.mintAccessToken("user-1", "user@example.com", "username", "CUSTOMER", "session-1");
        TokenPayload payload = provider.validateToken(token);
        assertNotNull(payload);
        assertEquals("user-1", payload.getSub());
    }

    // Test 4: Critical Bug - Bad Signature
    @Test
    void test04_ValidateToken_BadSignature() throws Exception {
        String token = provider.mintAccessToken("user-1", "user@example.com", "username", "CUSTOMER", "session-1");
        String tampered = token.substring(0, token.lastIndexOf('.')) + ".bad";

        JwtProcessingException thrown = assertThrows(JwtProcessingException.class, () -> {
            provider.validateToken(tampered);
        });
        assertNotNull(thrown);
    }

    // Test 5: Expiration Settings - Access Token
    @Test
    void test05_AccessTokenExpiration() throws Exception {
        assertEquals(900, provider.getAccessTokenExpirationSeconds());
    }

    // Test 6: Expiration Settings - Refresh Token
    @Test
    void test06_RefreshTokenExpiration() throws Exception {
        assertEquals(604800, provider.getRefreshTokenExpirationSeconds());
    }

    // Test 7: JWT Format - Valid Structure
    @Test
    void test07_JwtFormat_ThreePartStructure() throws Exception {
        String token = provider.mintAccessToken("user-1", "user@example.com", "username", "CUSTOMER", "session-1");
        String[] parts = token.split("\\.");
        assertEquals(3, parts.length);
    }

    // Test 8: Token Claims - User ID
    @Test
    void test08_TokenClaims_UserSubject() throws Exception {
        String token = provider.mintAccessToken("test-user-id", "user@example.com", "username", "CUSTOMER", "session");
        TokenPayload payload = provider.validateToken(token);
        assertEquals("test-user-id", payload.getSub());
    }

    // Test 9: Token Claims - Email
    @Test
    void test09_TokenClaims_Email() throws Exception {
        String token = provider.mintAccessToken("user-1", "test@example.com", "username", "CUSTOMER", "session");
        TokenPayload payload = provider.validateToken(token);
        assertEquals("test@example.com", payload.getEmail());
    }

    // Test 10: Token Claims - Role
    @Test
    void test10_TokenClaims_Role() throws Exception {
        String token = provider.mintAccessToken("user-1", "user@example.com", "username", "ADMIN", "session");
        TokenPayload payload = provider.validateToken(token);
        assertEquals("ADMIN", payload.getRole());
    }

    // Test 11: Cross-Language Compatibility - Standard JWT Format
    @Test
    void test11_StandardJWTFormat() throws Exception {
        String token = provider.mintAccessToken("user-1", "user@example.com", "username", "CUSTOMER", "session");
        // JWT format: Base64(Header).Base64(Payload).Signature
        assertTrue(token.matches("[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+"));
    }
}
