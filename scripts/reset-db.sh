#!/bin/bash
# Reset the SurrealDB database by removing local data

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Stopping SurrealDB container..."
cd "$PROJECT_DIR"
docker-compose down

echo "Removing local data..."
rm -rf "$PROJECT_DIR/data/surreal"
mkdir -p "$PROJECT_DIR/data/surreal"

echo "Starting fresh SurrealDB..."
docker-compose up -d

echo "Waiting for SurrealDB to be ready..."
sleep 5

echo "Re-applying schema..."
bun run db:setup

echo "Done! Fresh database ready."
