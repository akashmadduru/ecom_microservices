FROM maven:3.9-eclipse-temurin-25 AS builder

WORKDIR /build

COPY pom.xml .
COPY libs/ libs/
COPY services/auth-service/ services/auth-service/
COPY services/product-service/ services/product-service/
COPY services/inventory-service/ services/inventory-service/
COPY services/api-gateway/ services/api-gateway/

RUN mvn clean package -DskipTests -pl services/product-service -am

FROM eclipse-temurin:25-jre-alpine

WORKDIR /app

COPY --from=builder /build/services/product-service/target/product-service-*.jar app.jar

EXPOSE 8082

ENTRYPOINT ["java", "-jar", "app.jar"]
