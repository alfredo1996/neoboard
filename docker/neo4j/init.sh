#!/bin/bash
set -e

# Start Neo4j in the background
neo4j start

# Wait for Neo4j to be ready
echo "Waiting for Neo4j to start..."
until cypher-shell -u neo4j -p neoboard123 "RETURN 1" > /dev/null 2>&1; do
  sleep 2
done
echo "Neo4j is ready."

# Run init script if data hasn't been seeded yet
SEED_MARKER="/data/seed_complete"
if [ ! -f "$SEED_MARKER" ]; then
  echo "Running init.cypher seed data..."
  cypher-shell -u neo4j -p neoboard123 -f /var/lib/neo4j/import/init.cypher
  touch "$SEED_MARKER"
  echo "Seed data loaded successfully."
else
  echo "Seed data already loaded, skipping."
fi

# Stop the background instance and run in foreground
neo4j stop
exec neo4j console
