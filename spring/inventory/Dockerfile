FROM maven:3.9-eclipse-temurin-25 AS builder

WORKDIR /app

# Copy parent pom and all modules
COPY spring/pom.xml .
COPY spring/inventory ./inventory

# Build the project
RUN mvn -B clean package -pl inventory -am -DskipTests

FROM eclipse-temurin:25-jre

WORKDIR /app

COPY --from=builder /app/inventory/target/*.jar app.jar

EXPOSE 8085

ENTRYPOINT ["java", "-jar", "app.jar"]
