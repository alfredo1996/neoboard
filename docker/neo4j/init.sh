#!/bin/bash
set -e

# Set the initial password (NEO4J_AUTH env is not processed since we override entrypoint)
neo4j-admin dbms set-initial-password neoboard123 2>/dev/null || true

SEED_MARKER="/data/seed_complete"

# Background seeding process
(
  echo "Waiting for Neo4j to become available..."
  until cypher-shell -u neo4j -p neoboard123 "RETURN 1" > /dev/null 2>&1; do
    sleep 2
  done
  echo "Neo4j is ready."

  if [ ! -f "$SEED_MARKER" ]; then
    echo "Running init.cypher seed data..."
    cypher-shell -u neo4j -p neoboard123 -f /var/lib/neo4j/import/init.cypher
    touch "$SEED_MARKER"
    echo "Seed data loaded successfully."
  else
    echo "Seed data already loaded, skipping."
  fi
) &

# Start Neo4j in foreground (this is PID 1 — keeps the container alive)
exec neo4j console