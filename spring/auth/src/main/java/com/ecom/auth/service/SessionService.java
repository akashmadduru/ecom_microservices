package com.ecom.auth.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

@Service
@Slf4j
@RequiredArgsConstructor
public class SessionService {
    private final RedisTemplate<String, Object> redisTemplate;
    private final int refreshTokenTtlSeconds;

    public SessionService(RedisTemplate<String, Object> redisTemplate) {
        this.redisTemplate = redisTemplate;
        this.refreshTokenTtlSeconds = 7 * 86400; // 7 days
    }

    /**
     * Create a new session with the given session ID and refresh token JTI.
     */
    public void createSession(String sid, String userId, String refreshJti, String userAgent) {
        Map<String, String> sessionData = new HashMap<>();
        sessionData.put("user_id", userId);
        sessionData.put("created_at", Instant.now().toString());
        sessionData.put("user_agent", userAgent != null ? userAgent.substring(0, Math.min(300, userAgent.length())) : "");
        sessionData.put("current_refresh_jti", refreshJti);

        redisTemplate.opsForHash().putAll(
            "session:" + sid,
            sessionData
        );
        redisTemplate.expire("session:" + sid, refreshTokenTtlSeconds, TimeUnit.SECONDS);
        redisTemplate.opsForValue().set("refresh:" + refreshJti, sid, refreshTokenTtlSeconds, TimeUnit.SECONDS);
        redisTemplate.opsForSet().add("user_sessions:" + userId, sid);
    }

    /**
     * Get session data by session ID.
     */
    public Map<Object, Object> getSession(String sid) {
        Map<Object, Object> session = redisTemplate.opsForHash().entries("session:" + sid);
        return session.isEmpty() ? null : session;
    }

    /**
     * Rotate the refresh token: delete old JTI, create new one.
     */
    public void rotateRefreshToken(String sid, String oldJti, String newJti) {
        redisTemplate.delete("refresh:" + oldJti);
        redisTemplate.opsForValue().set("refresh:" + newJti, sid, refreshTokenTtlSeconds, TimeUnit.SECONDS);
        redisTemplate.opsForHash().put("session:" + sid, "current_refresh_jti", newJti);
        redisTemplate.expire("session:" + sid, refreshTokenTtlSeconds, TimeUnit.SECONDS);
    }

    /**
     * Destroy a single session.
     */
    public void destroySession(String sid) {
        Map<Object, Object> session = getSession(sid);
        if (session != null && !session.isEmpty()) {
            Object jti = session.get("current_refresh_jti");
            if (jti != null) {
                redisTemplate.delete("refresh:" + jti.toString());
            }
            Object userId = session.get("user_id");
            if (userId != null) {
                redisTemplate.opsForSet().remove("user_sessions:" + userId.toString(), sid);
            }
        }
        redisTemplate.delete("session:" + sid);
    }

    /**
     * Destroy all sessions for a user and return the count.
     */
    public long destroyAllSessions(String userId) {
        Set<Object> sids = redisTemplate.opsForSet().members("user_sessions:" + userId);
        if (sids != null) {
            for (Object sid : sids) {
                destroySession(sid.toString());
            }
        }
        redisTemplate.delete("user_sessions:" + userId);
        return sids != null ? sids.size() : 0;
    }

    /**
     * Denylist an access token JTI with a TTL.
     */
    public void denylistAccessJti(String jti, long remainingSeconds) {
        if (remainingSeconds > 0) {
            redisTemplate.opsForValue().set("denylist:jti:" + jti, "1", remainingSeconds, TimeUnit.SECONDS);
        }
    }

    /**
     * Check if a JTI is denylisted.
     */
    public boolean isAccessJtiDenylisted(String jti) {
        return Boolean.TRUE.equals(redisTemplate.hasKey("denylist:jti:" + jti));
    }

    /**
     * Store an OAuth state nonce for CSRF protection (600s TTL).
     */
    public void storeOAuthState(String state) {
        redisTemplate.opsForValue().set("oauth:state:" + state, "1", 600, TimeUnit.SECONDS);
    }

    /**
     * Validate and consume an OAuth state nonce.
     */
    public boolean validateAndConsumeOAuthState(String state) {
        String key = "oauth:state:" + state;
        Boolean exists = redisTemplate.hasKey(key);
        if (Boolean.TRUE.equals(exists)) {
            redisTemplate.delete(key);
            return true;
        }
        return false;
    }
}
