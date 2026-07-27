#!/bin/bash

set -e

echo "🛑 Stopping E-Commerce Microservices..."

docker-compose down -v

echo "✅ All services stopped and volumes removed."
