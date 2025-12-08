#!/bin/bash
# Reset the SurrealDB database by removing the Docker volume

echo "Stopping SurrealDB container..."
docker-compose down

echo "Removing volume..."
docker volume rm mastra-agent-surreal-starter_surrealdb-data 2>/dev/null || true

echo "Starting fresh SurrealDB..."
docker-compose up -d

echo "Waiting for SurrealDB to be ready..."
sleep 3

echo "Re-applying schema..."
npm run db:setup

echo "Done! Fresh database ready."
