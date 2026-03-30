#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Run base setup (Docker, deps, env, migrations)
"$ROOT_DIR/scripts/setup.sh"
echo ""

# Seed Neo4j graph data if empty
echo "==> Seeding Neo4j graph data..."
SEEDED=$(docker exec neoboard-neo4j cypher-shell -u neo4j -p neoboard123 "MATCH (n) RETURN count(n) AS c" 2>/dev/null | tail -1)
if [ "$SEEDED" = "0" ] || [ -z "$SEEDED" ]; then
  docker exec neoboard-neo4j cypher-shell -u neo4j -p neoboard123 -f /var/lib/neo4j/import/init.cypher
  echo "    Neo4j seed complete."
else
  echo "    Neo4j already has data ($SEEDED nodes), skipping."
fi
echo ""

# Seed demo user, connectors, and dashboards
echo "==> Seeding demo user, connectors, and dashboards..."
node "$ROOT_DIR/scripts/seed-demo.mjs"
echo ""

# Verify
USER_COUNT=$(docker exec neoboard-postgres psql -U neoboard -d neoboard -tAc "SELECT count(*) FROM \"user\"" 2>/dev/null || echo "0")
if [ "$USER_COUNT" = "0" ] || [ -z "$USER_COUNT" ]; then
  echo "    No users found — seed may have failed."
  echo "    Visit http://localhost:3000/signup to create admin manually."
else
  echo "    Found $USER_COUNT user(s)."
  echo "    Login: admin@neoboard.local / admin123"
fi
echo ""

echo "==> Demo setup complete!"
echo ""
echo "    Start the dev server:  npm run dev"
echo "    App:                   http://localhost:3000"
echo "    Storybook:             npm run storybook (port 6006)"
