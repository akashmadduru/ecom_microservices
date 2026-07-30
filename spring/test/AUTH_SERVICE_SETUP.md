# Auth Service Setup Guide

## Overview

The Auth Service is a complete Spring Boot microservice that handles authentication and authorization for the ecommerce platform. It provides:

- User registration and login (username/password)
- OAuth2 Google Single Sign-On (SSO)
- JWT access token and refresh token management
- Session management with token rotation
- RBAC (Role-Based Access Control)
- Redis-backed state management for CSRF protection

## Architecture

### Layering
```
Controller (REST endpoints)
    ↓
Service (Business logic)
    ↓
Repository (Data access)
    ↓
Database (PostgreSQL)
    ↓
Redis (Session/state store)
```

### Key Components

**Entities:**
- `User` - User account information with JPA annotations

**Repositories:**
- `UserRepository` - Spring Data JPA for user persistence

**Services:**
- `AuthService` - Core authentication business logic
- `SecurityService` - JWT token creation/verification, password hashing
- `SessionService` - Redis-backed session and state management
- `OAuth2GoogleService` - Google OAuth2 integration

**Controllers:**
- `AuthController` - REST endpoints for all auth operations

**Exception Handling:**
- Global `@ControllerAdvice` exception handler for consistent error responses

## Prerequisites

### Required Services
- PostgreSQL 13+
- Redis 6+
- Java 25
- Maven 3.8+

### Environment Variables

Create a `.env` file or set these before running:

```bash
JWT_SECRET=your-256-bit-secret-key-change-this-in-production
GOOGLE_OAUTH2_CLIENT_ID=your-google-client-id
GOOGLE_OAUTH2_CLIENT_SECRET=your-google-client-secret
```

## Database Setup

### Create Database and User

```sql
-- Connect as superuser
psql -U postgres

-- Create database
CREATE DATABASE auth_db;

-- Create user
CREATE USER auth_user WITH PASSWORD 'auth_user';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE auth_db TO auth_user;
GRANT ALL PRIVILEGES ON SCHEMA public TO auth_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO auth_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO auth_user;
```

### Verify Connection

```bash
psql -U auth_user -d auth_db -c "SELECT version();"
```

## Running the Auth Service

### Option 1: Maven (Recommended for Development)

```bash
cd spring/auth-service

# Build
mvn clean package

# Run
mvn spring-boot:run -Dspring-boot.run.arguments="--server.port=8082"
```

### Option 2: Docker (Recommended for Production)

```bash
# Build Docker image
docker build -t ecom/auth-service:latest .

# Run with Docker Compose
docker-compose up auth-service
```

### Option 3: Executable JAR

```bash
cd spring/auth-service

# Build
mvn clean package

# Run
java -jar target/auth-service-1.0.0.jar
```

## API Endpoints

### Authentication Endpoints

#### 1. Register User
```bash
curl -X POST http://localhost:8082/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "email": "john@example.com",
    "password": "SecurePass123!",
    "role": "USER"
  }'
```

**Response (201 Created):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "username": "john_doe",
  "email": "john@example.com",
  "role": "USER",
  "provider": "local",
  "isActive": true,
  "createdAt": "2026-07-28T19:36:00Z",
  "updatedAt": "2026-07-28T19:36:00Z"
}
```

#### 2. Sign In (Username/Password)
```bash
curl -X POST http://localhost:8082/api/v1/auth/signin \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "password": "SecurePass123!"
  }'
```

**Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 900,
  "role": "USER"
}
```

#### 3. Refresh Tokens
```bash
curl -X POST http://localhost:8082/api/v1/auth/token/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

**Response (200 OK):** Same as sign in response

#### 4. Logout
```bash
curl -X POST http://localhost:8082/api/v1/auth/logout \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response (204 No Content)**

#### 5. Logout All Sessions
```bash
curl -X POST http://localhost:8082/api/v1/auth/logout/all \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response (200 OK):**
```json
{
  "revoked_sessions": 3
}
```

### OAuth2 Google SSO Endpoints

#### 1. Start Google OAuth Flow
```bash
# Redirect user browser to this URL
http://localhost:8082/api/v1/auth/sso/google/authorize
```

#### 2. Google Callback (Automatic)
```
http://localhost:8082/api/v1/auth/sso/google/callback?code=xxx&state=yyy
```

#### 3. Direct Google Token Login
```bash
curl -X POST http://localhost:8082/api/v1/auth/sso/google \
  -H "Content-Type: application/json" \
  -d '{
    "token": "eyJhbGciOiJSUzI1NiIsImtpZCI6IiJ9..."
  }'
```

#### 4. Generic SSO Login
```bash
curl -X POST http://localhost:8082/api/v1/auth/sso/login \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "google",
    "subject": "1234567890",
    "email": "user@gmail.com",
    "displayName": "John Doe"
  }'
```

### User Info Endpoints

#### 1. Validate Token
```bash
curl -X GET http://localhost:8082/api/v1/auth/validate \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

#### 2. Get Current User
```bash
curl -X GET http://localhost:8082/api/v1/auth/users/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

#### 3. Get User by ID (Service-to-Service)
```bash
curl -X GET http://localhost:8082/api/v1/auth/internal/users/550e8400-e29b-41d4-a716-446655440000 \
  -H "Content-Type: application/json"
```

## JWT Token Structure

### Access Token Claims
```json
{
  "sub": "user-uuid",
  "username": "john_doe",
  "email": "john@example.com",
  "role": "USER",
  "sid": "session-uuid",
  "jti": "token-id",
  "typ": "access",
  "iat": 1690555000,
  "exp": 1690555900,
  "nbf": 1690555000,
  "iss": "auth-service",
  "aud": "ecom-api"
}
```

### Refresh Token Claims
```json
{
  "sub": "user-uuid",
  "sid": "session-uuid",
  "jti": "token-id",
  "typ": "refresh",
  "iat": 1690555000,
  "exp": 1690900800,
  "nbf": 1690555000,
  "iss": "auth-service",
  "aud": "ecom-api"
}
```

## Configuration

### application.yml Key Properties

```yaml
# Database
spring.datasource.url: jdbc:postgresql://localhost:5432/auth_db
spring.datasource.username: auth_user
spring.datasource.password: auth_user

# Redis
spring.data.redis.host: localhost
spring.data.redis.port: 6379

# JWT
auth.jwt-secret: ${JWT_SECRET}
auth.jwt-issuer: auth-service
auth.jwt-audience: ecom-api
auth.access-token-expire-minutes: 15
auth.refresh-token-expire-days: 7

# Google OAuth2
auth.google-oauth2-client-id: ${GOOGLE_OAUTH2_CLIENT_ID}
auth.google-oauth2-client-secret: ${GOOGLE_OAUTH2_CLIENT_SECRET}
auth.google-oauth2-redirect-uri: http://localhost:8082/api/v1/auth/sso/google/callback

# Service Discovery
eureka.client.serviceUrl.defaultZone: http://localhost:8761/eureka/
```

## Security Features

### Password Policy
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one digit
- At least one special character

### Token Expiry
- Access Token: 15 minutes
- Refresh Token: 7 days

### Refresh Token Rotation
- Old token immediately blacklisted
- New token issued on refresh
- Reuse detection: if stale token used, entire session revoked

### Redis Session Keys
```
session:{sid}               # Session data (TTL = 7 days)
refresh:{jti}              # Refresh token to session mapping (TTL = 7 days)
denylist:jti:{jti}         # Denylisted access tokens (TTL = remaining lifetime)
oauth:state:{state}        # OAuth state nonce (TTL = 600s)
user_sessions:{user_id}    # Set of user's session IDs
```

### CSRF Protection
- OAuth2 state parameter validated via Redis
- 600-second TTL on state tokens

## Troubleshooting

### Database Connection Error
```
Check:
1. PostgreSQL is running: psql -U postgres -l
2. auth_db exists: psql -U auth_user -d auth_db
3. Firewall allows port 5432
4. Credentials in application.yml match
```

### Redis Connection Error
```
Check:
1. Redis is running: redis-cli ping
2. Redis port 6379 is open
3. No firewall blocking
```

### Token Verification Failed
```
Check:
1. JWT_SECRET environment variable is set
2. Token hasn't expired
3. Token signature is valid
4. Issuer and audience match configuration
```

### Google OAuth2 Errors
```
Check:
1. Google OAuth2 credentials are valid
2. Redirect URI matches Google Console configuration
3. State token hasn't expired (600s)
4. Google ID token signature is valid
```

## Performance Tuning

### Database Connection Pool
```yaml
spring.datasource.hikari.maximum-pool-size: 10
spring.datasource.hikari.minimum-idle: 2
```

### Redis Connection Pool
```yaml
spring.data.redis.jedis.pool.max-active: 8
spring.data.redis.jedis.pool.max-idle: 8
```

### Batch Processing
```yaml
hibernate.jdbc.batch_size: 20
hibernate.jdbc.fetch_size: 50
```

## Integration with API Gateway

The API Gateway (`spring/gateway`) validates JWT tokens from the auth-service before routing requests to downstream services.

### Token Flow
1. Client gets token from auth-service
2. Client sends token in `Authorization: Bearer <token>` header
3. Gateway validates token using the same JWT secret
4. Gateway adds user info headers: `X-User-ID`, `X-Username`, `X-User-Role`
5. Request forwarded to downstream service

### Example Gateway Configuration
```yaml
auth:
  jwt-secret: ${JWT_SECRET}  # Same as auth-service
  jwt-issuer: auth-service
  jwt-audience: ecom-api
```

## Testing

### Unit Tests
```bash
cd spring/auth-service
mvn test -Dtest=AuthServiceTest
```

### Integration Tests (with TestContainers)
```bash
cd spring/auth-service
mvn test
```

### Load Testing (with JMeter/Gatling)
```bash
# Example: 100 requests per second for 5 minutes
```

## Production Deployment

### Secrets Management
1. Use AWS Secrets Manager or HashiCorp Vault
2. Never commit secrets to git
3. Environment variables for CI/CD

### SSL/TLS
```yaml
server:
  ssl:
    key-store: classpath:keystore.p12
    key-store-password: ${KEY_STORE_PASSWORD}
    protocol: TLSv1.2
```

### Logging
```yaml
logging:
  level:
    com.ecom.auth: INFO
  file: logs/auth-service.log
  max-file-size: 10MB
  max-history: 30
```

### Monitoring
- Micrometer metrics to Prometheus
- Distributed tracing via Zipkin/Jaeger
- Health checks via /actuator/health

## Contributing

When modifying auth-service:
1. Maintain transactional boundaries at service layer
2. Validate JWT expiry and signatures
3. Use consistent error codes
4. Add tests for new endpoints
5. Update migration files, never modify existing ones

