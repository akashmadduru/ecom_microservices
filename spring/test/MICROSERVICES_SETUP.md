# Spring Microservices Setup Guide

## Parent POM Configuration

All Spring Boot microservices inherit from a common parent POM (`pom.xml`) that centralizes:

- **Java Version**: 25 LTS
- **Spring Boot**: 4.1.0
- **Spring Cloud**: 2025.1.2
- **Common Maven Plugins**: spring-boot-maven-plugin, maven-compiler-plugin

## Creating a New Microservice

### Step 1: Generate Project from Spring Boot Initializer

Visit [Spring Boot Initializer](https://start.spring.io/) and configure:

- **Project**: Maven
- **Language**: Java
- **Spring Boot**: 4.1.0
- **Project Name**: your-service-name
- **Artifact ID**: your-service-name
- **Java Version**: 25

**Dependencies** (pick based on your service):
- Spring Boot Web Starter (for REST APIs)
- Spring Data JPA (for database)
- Spring Cloud Gateway Server WebFlux (for API Gateway)
- Spring Cloud Starter Netflix Eureka Client (for service discovery)
- PostgreSQL Driver
- Spring Boot Test

### Step 2: Add Service Directory

Extract the generated project to `spring/{your-service-name}/`

```bash
cd spring
# Extract downloaded zip to this directory
unzip spring-boot-project.zip -d your-service-name
```

### Step 3: Update Parent POM

Open `spring/{your-service-name}/pom.xml` and replace the parent section:

**Before:**
```xml
<parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>4.1.0</version>
    <relativePath/> <!-- lookup parent from repository -->
</parent>
```

**After:**
```xml
<parent>
    <groupId>com.ecom</groupId>
    <artifactId>ecom-spring-parent</artifactId>
    <version>1.0.0</version>
    <relativePath>../pom.xml</relativePath>
</parent>
```

### Step 4: Remove Duplicate Configurations

Delete these blocks from `spring/{your-service-name}/pom.xml`:

```xml
<!-- REMOVE: Duplicate properties -->
<properties>
    <java.version>25</java.version>
</properties>

<!-- REMOVE: Duplicate Spring Cloud dependencyManagement -->
<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>org.springframework.cloud</groupId>
            <artifactId>spring-cloud-dependencies</artifactId>
            ...
        </dependency>
    </dependencies>
</dependencyManagement>
```

### Step 5: Configure Application Properties

Create `src/main/resources/application.yml`:

```yaml
spring:
  application:
    name: your-service-name
  datasource:
    url: jdbc:postgresql://localhost:5432/ecom_your_service
    username: ${DB_USER:postgres}
    password: ${DB_PASSWORD:password}
    hikari:
      maximum-pool-size: 10
  jpa:
    hibernate:
      ddl-auto: validate
    show-sql: false
  flyway:
    enabled: true
    locations: classpath:db/migration

server:
  port: 8085  # Adjust port for your service

logging:
  level:
    root: INFO
    com.ecom: DEBUG
```

### Step 6: Create Main Application Class

`src/main/java/com/ecom/yourservice/YourServiceApplication.java`:

```java
package com.ecom.yourservice;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;

@SpringBootApplication
@EnableDiscoveryClient
public class YourServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(YourServiceApplication.class, args);
    }
}
```

## Common Dependencies Available via Parent POM

All microservices have access to these versions through the parent:

### Spring Boot Starters
- `spring-boot-starter-web`
- `spring-boot-starter-data-jpa`
- `spring-boot-starter-data-redis-reactive`
- `spring-boot-starter-test`

### Spring Cloud
- `spring-cloud-starter-gateway-server-webflux`
- `spring-cloud-starter-netflix-eureka-client`
- `spring-cloud-dependencies` (BOM)

### Just Add to Your Service pom.xml

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-XXXX</artifactId>
    <!-- Version inherited from parent -->
</dependency>
```

## Directory Structure

```
spring/
├── pom.xml                          # Parent POM (defines versions)
├── MICROSERVICE_TEMPLATE.xml        # Template for new services
├── MICROSERVICES_SETUP.md           # This file
├── gateway/
│   ├── pom.xml                      # Inherits from parent
│   ├── src/
│   ├── Dockerfile
│   └── ...
├── order-service/
│   ├── pom.xml                      # Inherits from parent
│   ├── src/
│   ├── Dockerfile
│   └── ...
└── payment-service/
    ├── pom.xml                      # Inherits from parent
    ├── src/
    ├── Dockerfile
    └── ...
```

## Adding Service to Docker Compose

Once created, add to root `docker-compose.yml`:

```yaml
order-service:
  build:
    context: .
    dockerfile: spring/order-service/Dockerfile
  container_name: ecom_order_service
  environment:
    SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/ecom_order
    SPRING_DATASOURCE_USERNAME: ${DB_USER:-ecom_user}
    SPRING_DATASOURCE_PASSWORD: ${DB_PASSWORD:-ecom_password}
    SPRING_KAFKA_BOOTSTRAP_SERVERS: kafka:29092
    SERVER_PORT: 8085
  ports:
    - "8085:8085"
  depends_on:
    postgres:
      condition: service_healthy
    kafka:
      condition: service_healthy
  networks:
    - ecom-network
  restart: on-failure
```

## Adding to Root POM (Optional, for Multi-Module Build)

If you want to build all services together, update root pom.xml modules:

```xml
<modules>
    <module>spring/gateway</module>
    <module>spring/order-service</module>
    <module>spring/payment-service</module>
</modules>
```

Then build all:
```bash
mvn clean install -DskipTests
```

## Notes

- All versions are centralized in `spring/pom.xml`
- Update versions in parent POM once, affects all services
- Each service can still add service-specific dependencies
- Use Spring Cloud for inter-service communication
- Use Kafka for async event-driven communication
