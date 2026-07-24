#!/bin/bash
# Stop this project's containers and remove its dangling volumes/networks.
# Scoped to this project via the docker-compose project label — deliberately
# NOT a machine-wide `docker system prune`, which would wipe every other
# project's containers/images/volumes on this machine too.
PROJECT_LABEL="com.docker.compose.project=ecom_microservices"

docker stop $(docker ps -a -q --filter "label=$PROJECT_LABEL") 2>/dev/null
docker rm -f $(docker ps -a -q --filter "label=$PROJECT_LABEL") 2>/dev/null
docker volume rm -f $(docker volume ls -q --filter "label=$PROJECT_LABEL") 2>/dev/null
docker network prune -f --filter "label=$PROJECT_LABEL" 2>/dev/null
