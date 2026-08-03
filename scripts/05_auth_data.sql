-- Auth Database Sample Data

-- Insert sample users
INSERT INTO users (username, email, password_hash, role, provider, is_active) VALUES
('admin', 'admin@ecom.local', '$2a$10$XQs0XzXzXzXzXzXzXzXzXe9v9v9v9v9v9v9v9v9v9v9v9v9v9v9v9v', 'ADMIN', 'local', TRUE),
('john_doe', 'john@example.com', '$2a$10$YQs0YzYzYzYzYzYzYzYzYe9y9y9y9y9y9y9y9y9y9y9y9y9y9y9y9y', 'USER', 'local', TRUE),
('jane_smith', 'jane@example.com', '$2a$10$ZQs0ZzZzZzZzZzZzZzZzZe9z9z9z9z9z9z9z9z9z9z9z9z9z9z9z9z', 'USER', 'local', TRUE),
('mike_johnson', 'mike@example.com', '$2a$10$AQs0AzAzAzAzAzAzAzAzAe9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a9a', 'USER', 'local', TRUE),
('sarah_williams', 'sarah@example.com', '$2a$10$BQs0BzBzBzBzBzBzBzBzBe9b9b9b9b9b9b9b9b9b9b9b9b9b9b9b9b', 'USER', 'local', TRUE),
('google_user', 'googleuser@gmail.com', NULL, 'USER', 'google', TRUE),
('guest_user', 'guest@ecom.local', NULL, 'USER', 'guest', FALSE);

-- Insert OAuth providers
INSERT INTO oauth_providers (provider_name, client_id, client_secret, authorize_url, token_url, userinfo_url, redirect_uri, scopes, is_active) VALUES
('google', 'your-google-client-id.apps.googleusercontent.com', 'your-google-client-secret', 'https://accounts.google.com/o/oauth2/v2/auth', 'https://oauth2.googleapis.com/token', 'https://www.googleapis.com/oauth2/v2/userinfo', 'http://localhost:8080/api/v1/auth/sso/google/callback', 'openid email profile', TRUE),
('github', 'your-github-client-id', 'your-github-client-secret', 'https://github.com/login/oauth/authorize', 'https://github.com/login/oauth/access_token', 'https://api.github.com/user', 'http://localhost:8080/api/v1/auth/sso/github/callback', 'user:email', FALSE);
