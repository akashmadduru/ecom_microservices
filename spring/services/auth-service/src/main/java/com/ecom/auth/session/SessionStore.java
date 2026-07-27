package com.ecom.auth.session;

import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;

@Component
public class SessionStore {
    private static final String SESSION_PREFIX = "session:";
    private static final String DENYLIST_PREFIX = "auth:token_denylist:";
    private static final String HASH_USER_ID = "user_id";
    private static final String HASH_REFRESH_JTI = "refresh_jti";
    private static final String HASH_USER_AGENT = "user_agent";

    private final RedisTemplate<String, Object> redisTemplate;

    public SessionStore(RedisTemplate<String, Object> redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    public void storeSession(String sessionId, String userId, String refreshJti, String userAgent, int ttlSeconds) {
        String key = SESSION_PREFIX + sessionId;
        redisTemplate.opsForHash().put(key, HASH_USER_ID, userId);
        redisTemplate.opsForHash().put(key, HASH_REFRESH_JTI, refreshJti);
        redisTemplate.opsForHash().put(key, HASH_USER_AGENT, userAgent);
        redisTemplate.expire(key, ttlSeconds, TimeUnit.SECONDS);
    }

    public SessionData getSession(String sessionId) {
        String key = SESSION_PREFIX + sessionId;
        Object userId = redisTemplate.opsForHash().get(key, HASH_USER_ID);
        Object refreshJti = redisTemplate.opsForHash().get(key, HASH_REFRESH_JTI);
        Object userAgent = redisTemplate.opsForHash().get(key, HASH_USER_AGENT);

        if (userId == null) {
            return null;
        }

        return new SessionData((String) userId, (String) refreshJti, (String) userAgent);
    }

    public void updateSession(String sessionId, String newRefreshJti, int ttlSeconds) {
        String key = SESSION_PREFIX + sessionId;
        redisTemplate.opsForHash().put(key, HASH_REFRESH_JTI, newRefreshJti);
        redisTemplate.expire(key, ttlSeconds, TimeUnit.SECONDS);
    }

    public void addTokenToDenylist(String jti, int ttlSeconds) {
        String key = DENYLIST_PREFIX + jti;
        redisTemplate.opsForValue().set(key, "1", ttlSeconds, TimeUnit.SECONDS);
    }

    public boolean isTokenDenylisted(String jti) {
        String key = DENYLIST_PREFIX + jti;
        return Boolean.TRUE.equals(redisTemplate.hasKey(key));
    }

    public void deleteSession(String sessionId) {
        String key = SESSION_PREFIX + sessionId;
        redisTemplate.delete(key);
    }
}
