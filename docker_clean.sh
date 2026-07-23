#!/bin/bash
# Stop and remove all containers (running and stopped)
# docker ps -a -q lists all container IDs
# docker rm -f forces removal of running containers
echo "Stopping and removing all containers..."
docker rm -f $(docker ps -a -q) 2>/dev/null

# Remove all images
# docker images -q lists all image IDs
# docker rmi forces removal of images even if used by containers (which are now gone)
echo "Removing all images..."
docker rmi -f ecom_microservices-api-gateway:latest
docker rmi -f ecom_microservices-auth-service:latest
docker rmi -f ecom_microservices-product-service:latest
docker rmi -f ecom_microservices-inventory-service:latest

echo "Cleanup complete."   


echo "Rebuilding images and spining on containers"   

docker compose up