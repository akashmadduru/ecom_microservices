package com.ecom.auth.session;

import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;

@Component
public class SessionStore {
    private static final String SESSION_PREFIX = "session:";
    private static final String DENYLIST_PREFIX = "auth:token_denylist:";

    private final RedisTemplate<String, SessionData> redisTemplate;
    private final RedisTemplate<String, String> stringRedisTemplate;

    public SessionStore(RedisTemplate<String, SessionData> redisTemplate,
                       RedisTemplate<String, String> stringRedisTemplate) {
        this.redisTemplate = redisTemplate;
        this.stringRedisTemplate = stringRedisTemplate;
    }

    public void storeSession(String sessionId, String userId, String refreshJti, String userAgent, int ttlSeconds) {
        String key = SESSION_PREFIX + sessionId;
        SessionData sessionData = new SessionData(userId, refreshJti, userAgent);
        redisTemplate.opsForValue().set(key, sessionData, ttlSeconds, TimeUnit.SECONDS);
    }

    public SessionData getSession(String sessionId) {
        String key = SESSION_PREFIX + sessionId;
        return redisTemplate.opsForValue().get(key);
    }

    public void updateSession(String sessionId, String newRefreshJti, int ttlSeconds) {
        String key = SESSION_PREFIX + sessionId;
        SessionData sessionData = redisTemplate.opsForValue().get(key);
        if (sessionData != null) {
            sessionData.setCurrentRefreshJti(newRefreshJti);
            redisTemplate.opsForValue().set(key, sessionData, ttlSeconds, TimeUnit.SECONDS);
        }
    }

    public void addTokenToDenylist(String jti, int ttlSeconds) {
        String key = DENYLIST_PREFIX + jti;
        stringRedisTemplate.opsForValue().set(key, "", ttlSeconds, TimeUnit.SECONDS);
    }

    public boolean isTokenDenylisted(String jti) {
        String key = DENYLIST_PREFIX + jti;
        return stringRedisTemplate.hasKey(key);
    }

    public void deleteSession(String sessionId) {
        String key = SESSION_PREFIX + sessionId;
        redisTemplate.delete(key);
    }
}
