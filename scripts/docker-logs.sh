#!/bin/bash

SERVICE=${1:-""}

if [ -z "$SERVICE" ]; then
    echo "📋 Logs for all services:"
    docker-compose logs -f
else
    echo "📋 Logs for $SERVICE:"
    docker-compose logs -f "$SERVICE"
fi
