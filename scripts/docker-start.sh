#!/bin/bash

set -e

echo "🚀 Starting E-Commerce Microservices with Docker Compose..."

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose not found. Please install Docker Desktop or docker-compose."
    exit 1
fi

# Load environment variables
if [ -f .env.docker ]; then
    echo "📝 Loading .env.docker"
    export $(cat .env.docker | grep -v '^#' | xargs)
fi

# Build images
echo "🔨 Building Docker images..."
docker-compose build --no-cache

# Start services
echo "⬆️  Starting services..."
docker-compose up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check health
echo "🏥 Checking service health..."
for service in postgres redis zookeeper kafka auth-service product-service inventory-service api-gateway; do
    if docker-compose ps | grep -q "$service"; then
        echo "✅ $service is running"
    else
        echo "❌ $service failed to start"
    fi
done

echo ""
echo "✨ E-Commerce Microservices is up and running!"
echo ""
echo "📊 Service URLs:"
echo "  - API Gateway: http://localhost:8080"
echo "  - Auth Service: http://localhost:8081"
echo "  - Product Service: http://localhost:8082"
echo "  - Inventory Service: http://localhost:8083"
echo "  - PostgreSQL: localhost:5432"
echo "  - Redis: localhost:6379"
echo "  - Kafka: localhost:9092"
echo ""
echo "🔍 View logs:"
echo "  docker-compose logs -f"
echo ""
