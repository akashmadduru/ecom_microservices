FROM maven:3.9-eclipse-temurin-25 AS builder

WORKDIR /build

# Copy all necessary files
COPY pom.xml .
COPY libs/ libs/
COPY services/auth-service/ services/auth-service/
COPY services/product-service/ services/product-service/
COPY services/inventory-service/ services/inventory-service/
COPY services/api-gateway/ services/api-gateway/

# Build only auth-service with Java 25
RUN mvn clean package -DskipTests -pl services/auth-service -am

FROM eclipse-temurin:25-jre-alpine

WORKDIR /app

COPY --from=builder /build/services/auth-service/target/auth-service-*.jar app.jar

EXPOSE 8081

ENTRYPOINT ["java", "-jar", "app.jar"]
