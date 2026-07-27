#!/bin/bash

echo "📊 Service Status:"
docker-compose ps

echo ""
echo "💾 Docker System Info:"
docker system df
