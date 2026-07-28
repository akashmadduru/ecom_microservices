FROM maven:3.9-eclipse-temurin-21 AS builder

WORKDIR /build

COPY spring/pom.xml .
COPY spring/libs/ libs/
COPY spring/services/auth-service/ services/auth-service/
COPY spring/services/api-gateway/ services/api-gateway/

RUN mvn clean package -Dmaven.test.skip=true -pl services/api-gateway -am

FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

COPY --from=builder /build/services/api-gateway/target/api-gateway-*.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
