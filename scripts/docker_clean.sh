#!/bin/bash
# Stop and remove this project's containers, then rebuild and start fresh.
# Scoped to this project via the docker-compose project label so it never
# touches containers/images belonging to other projects on this machine.
PROJECT_LABEL="com.docker.compose.project=ecom_microservices"

echo "Stopping and removing this project's containers..."
docker rm -f $(docker ps -a -q --filter "label=$PROJECT_LABEL") 2>/dev/null

# Remove this project's images so the rebuild below is guaranteed fresh.
echo "Removing this project's images..."
docker rmi -f ecom_microservices-api-gateway:latest 2>/dev/null
docker rmi -f ecom_microservices-auth-service:latest 2>/dev/null
docker rmi -f ecom_microservices-product-service:latest 2>/dev/null
docker rmi -f ecom_microservices-inventory-service:latest 2>/dev/null

echo "Cleanup complete."

echo "Rebuilding images and spinning up containers..."
docker compose up --build
