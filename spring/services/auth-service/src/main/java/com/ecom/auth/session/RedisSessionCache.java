package com.ecom.auth.session;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;

@Component
public class RedisSessionCache {

    private static final String SESSION_PREFIX = "session:";
    private static final String DENYLIST_PREFIX = "denylist:";

    private final RedisTemplate<String, String> redisTemplate;
    private final ObjectMapper objectMapper;

    public RedisSessionCache(RedisTemplate<String, String> redisTemplate, ObjectMapper objectMapper) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
    }

    // Store login session
    public void storeSession(String sessionId, String userId, String jti, long ttlSeconds) throws JsonProcessingException {
        SessionData sessionData = new SessionData(userId, jti, "");
        String json = objectMapper.writeValueAsString(sessionData);
        String key = SESSION_PREFIX + sessionId;
        redisTemplate.opsForValue().set(key, json, ttlSeconds, TimeUnit.SECONDS);
    }

    // Retrieve session
    public SessionData getSession(String sessionId) throws JsonProcessingException {
        String key = SESSION_PREFIX + sessionId;
        String json = redisTemplate.opsForValue().get(key);
        if (json == null) {
            return null;
        }
        return objectMapper.readValue(json, SessionData.class);
    }

    // Invalidate session
    public void invalidateSession(String sessionId) {
        String key = SESSION_PREFIX + sessionId;
        redisTemplate.delete(key);
    }

    // Add token to denylist (for logout)
    public void addTokenToDenylist(String jti, long ttlSeconds) {
        String key = DENYLIST_PREFIX + jti;
        redisTemplate.opsForValue().set(key, "true", ttlSeconds, TimeUnit.SECONDS);
    }

    // Check if token is denylisted
    public boolean isTokenDenylisted(String jti) {
        String key = DENYLIST_PREFIX + jti;
        return Boolean.TRUE.equals(redisTemplate.hasKey(key));
    }

    // Get all active sessions for a user
    public long countUserSessions(String userId) {
        String pattern = SESSION_PREFIX + "*";
        return redisTemplate.keys(pattern).stream()
                .map(key -> redisTemplate.opsForValue().get(key))
                .filter(json -> {
                    try {
                        SessionData data = objectMapper.readValue(json, SessionData.class);
                        return userId.equals(data.getUserId());
                    } catch (JsonProcessingException e) {
                        return false;
                    }
                })
                .count();
    }

    // Clear all sessions for a user
    public void invalidateAllUserSessions(String userId) {
        String pattern = SESSION_PREFIX + "*";
        redisTemplate.keys(pattern).forEach(key -> {
            String json = redisTemplate.opsForValue().get(key);
            if (json != null) {
                try {
                    SessionData data = objectMapper.readValue(json, SessionData.class);
                    if (userId.equals(data.getUserId())) {
                        redisTemplate.delete(key);
                    }
                } catch (JsonProcessingException ignored) {
                }
            }
        });
    }
}
