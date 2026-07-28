FROM maven:3.9-eclipse-temurin-25 AS builder

WORKDIR /app

# Copy parent pom and all modules
COPY spring/pom.xml .
COPY spring/cart ./cart

# Build the project
RUN mvn -B clean package -pl cart -am -DskipTests

FROM eclipse-temurin:25-jre

WORKDIR /app

COPY --from=builder /app/cart/target/*.jar app.jar

EXPOSE 8084

ENTRYPOINT ["java", "-jar", "app.jar"]
