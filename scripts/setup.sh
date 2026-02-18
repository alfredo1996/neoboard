#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/app/.env.local"

echo "==> NeoBoard Setup"
echo ""

# 1. Start services
echo "==> Starting services via Docker Compose..."
docker compose -f "$ROOT_DIR/docker/docker-compose.yml" up -d

echo "    Waiting for PostgreSQL to be ready..."
until docker compose -f "$ROOT_DIR/docker/docker-compose.yml" exec -T postgres pg_isready -U neoboard > /dev/null 2>&1; do
  sleep 1
done
echo "    PostgreSQL is ready."

echo "    Waiting for Neo4j to be healthy..."
until docker inspect --format='{{.State.Health.Status}}' neoboard-neo4j 2>/dev/null | grep -q "healthy"; do
  sleep 3
done
echo "    Neo4j is healthy."

# Seed Neo4j if empty
SEEDED=$(docker exec neoboard-neo4j cypher-shell -u neo4j -p neoboard123 "MATCH (n) RETURN count(n) AS c" 2>/dev/null | tail -1)
if [ "$SEEDED" = "0" ] || [ -z "$SEEDED" ]; then
  echo "    Seeding Neo4j..."
  docker exec neoboard-neo4j cypher-shell -u neo4j -p neoboard123 -f /var/lib/neo4j/import/init.cypher
  echo "    Neo4j seed complete."
else
  echo "    Neo4j already has data ($SEEDED nodes), skipping seed."
fi
echo ""

# 2. Install dependencies
echo "==> Installing dependencies..."
npm install --prefix "$ROOT_DIR"
npm install --prefix "$ROOT_DIR/app"
npm install --prefix "$ROOT_DIR/component"
echo ""

# 3. Generate .env.local if it doesn't exist
if [ ! -f "$ENV_FILE" ]; then
  echo "==> Generating $ENV_FILE..."
  ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  NEXTAUTH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

  cat > "$ENV_FILE" <<EOF
DATABASE_URL=postgresql://neoboard:neoboard@localhost:5432/neoboard
ENCRYPTION_KEY=$ENCRYPTION_KEY
NEXTAUTH_SECRET=$NEXTAUTH_SECRET
NEXTAUTH_URL=http://localhost:3000
EOF
  echo "    Created $ENV_FILE with generated secrets."
else
  echo "==> $ENV_FILE already exists, skipping."
fi
echo ""

# 4. Run database migrations
echo "==> Running database migrations..."
npm run db:generate --prefix "$ROOT_DIR/app" 2>/dev/null || true
npm run db:migrate --prefix "$ROOT_DIR/app"
echo ""

# 5. Seed neoboard app data if empty
echo "==> Checking neoboard seed data..."
USER_COUNT=$(docker exec neoboard-postgres psql -U neoboard -d neoboard -tAc "SELECT count(*) FROM \"user\"" 2>/dev/null || echo "0")
if [ "$USER_COUNT" = "0" ] || [ -z "$USER_COUNT" ]; then
  echo "    Seeding neoboard app data..."
  docker exec -i neoboard-postgres psql -U neoboard -d neoboard <<'EOSQL'
INSERT INTO "user" ("id", "name", "email", "passwordHash") VALUES
    ('user-alice-001', 'Alice Demo', 'alice@example.com', '$2b$12$Y9ET62vxVM7zf3tXwTQHSuJ4j3RqlZziI35aVgZzcL8bWBDcAM5b6'),
    ('user-bob-002', 'Bob Demo', 'bob@example.com', '$2b$12$Y9ET62vxVM7zf3tXwTQHSuJ4j3RqlZziI35aVgZzcL8bWBDcAM5b6')
ON CONFLICT DO NOTHING;

INSERT INTO "connection" ("id", "userId", "name", "type", "configEncrypted") VALUES
    ('conn-neo4j-001', 'user-alice-001', 'Movies Graph (Neo4j)', 'neo4j', '{"host":"bolt://neo4j:7687","username":"neo4j","password":"neoboard123"}'),
    ('conn-pg-001', 'user-alice-001', 'Movies DB (PostgreSQL)', 'postgresql', '{"host":"postgres","port":5432,"database":"movies","username":"neoboard","password":"neoboard"}')
ON CONFLICT DO NOTHING;

INSERT INTO "dashboard" ("id", "userId", "name", "description", "isPublic", "layoutJson") VALUES
    ('dash-001', 'user-alice-001', 'Movie Analytics', 'Explore the movies dataset across Neo4j and PostgreSQL', true, '{"widgets":[{"id":"w1","chartType":"bar","connectionId":"conn-neo4j-001","query":"MATCH (p:Person)-[:ACTED_IN]->(m:Movie) RETURN m.title AS movie, count(p) AS cast_size ORDER BY cast_size DESC LIMIT 10","settings":{"title":"Top 10 Movies by Cast Size"}},{"id":"w2","chartType":"line","connectionId":"conn-pg-001","query":"SELECT released AS year, COUNT(*) AS movie_count FROM movies GROUP BY released ORDER BY released","settings":{"title":"Movies Released per Year"}}],"gridLayout":[{"i":"w1","x":0,"y":0,"w":6,"h":4},{"i":"w2","x":6,"y":0,"w":6,"h":4}]}'::jsonb),
    ('dash-002', 'user-bob-002', 'Actor Network', 'Graph-based actor collaboration insights', false, '{"widgets":[{"id":"w1","chartType":"table","connectionId":"conn-neo4j-001","query":"MATCH (p:Person)-[:DIRECTED]->(m:Movie) RETURN p.name AS director, count(m) AS movies_directed ORDER BY movies_directed DESC LIMIT 10","settings":{"title":"Most Prolific Directors"}}],"gridLayout":[{"i":"w1","x":0,"y":0,"w":12,"h":5}]}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO "dashboard_share" ("id", "dashboardId", "userId", "role") VALUES
    ('share-001', 'dash-001', 'user-bob-002', 'viewer')
ON CONFLICT DO NOTHING;
EOSQL
  echo "    Neoboard app data seeded."
else
  echo "    Neoboard app data already exists ($USER_COUNT users), skipping."
fi
echo ""

# 6. Start dev server
echo "==> Starting development server..."
echo "    App:       http://localhost:3000"
echo "    Storybook: npm run storybook (port 6006)"
echo ""
npm run dev --prefix "$ROOT_DIR"