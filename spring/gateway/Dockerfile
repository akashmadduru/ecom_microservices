FROM maven:3.9-eclipse-temurin-25 AS builder

WORKDIR /app

# Copy parent pom
COPY spring/pom.xml .

# Copy gateway
COPY spring/gateway ./gateway

# Build the project
RUN mvn -B clean package -pl gateway -am

FROM eclipse-temurin:25-jre

WORKDIR /app

COPY --from=builder /app/gateway/target/gateway-1.0.0.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
