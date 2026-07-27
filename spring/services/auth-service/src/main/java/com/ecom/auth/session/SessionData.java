package com.ecom.auth.session;

import java.io.Serializable;
import java.time.LocalDateTime;

public class SessionData implements Serializable {
    private static final long serialVersionUID = 1L;

    private String userId;
    private String currentRefreshJti;
    private String userAgent;
    private LocalDateTime createdAt;

    public SessionData() {}

    public SessionData(String userId, String currentRefreshJti, String userAgent) {
        this.userId = userId;
        this.currentRefreshJti = currentRefreshJti;
        this.userAgent = userAgent;
        this.createdAt = LocalDateTime.now();
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getCurrentRefreshJti() {
        return currentRefreshJti;
    }

    public void setCurrentRefreshJti(String currentRefreshJti) {
        this.currentRefreshJti = currentRefreshJti;
    }

    public String getUserAgent() {
        return userAgent;
    }

    public void setUserAgent(String userAgent) {
        this.userAgent = userAgent;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
