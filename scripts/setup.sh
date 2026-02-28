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
  ADMIN_BOOTSTRAP_TOKEN=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

  cat > "$ENV_FILE" <<EOF
DATABASE_URL=postgresql://neoboard:neoboard@localhost:5432/neoboard
ENCRYPTION_KEY=$ENCRYPTION_KEY
NEXTAUTH_SECRET=$NEXTAUTH_SECRET
NEXTAUTH_URL=http://localhost:3000
ADMIN_BOOTSTRAP_TOKEN=$ADMIN_BOOTSTRAP_TOKEN
EOF
  echo "    Created $ENV_FILE with generated secrets."
  echo ""
  echo "  ╔════════════════════════════════════════════════════════════════════╗"
  echo "  ║  ADMIN BOOTSTRAP TOKEN (keep this safe):                           ║"
  echo "  ║  $ADMIN_BOOTSTRAP_TOKEN  ║"
  echo "  ╚════════════════════════════════════════════════════════════════════╝"
  echo ""
  echo "  Visit /signup to create the first admin account using this token."
  echo "  After the first admin is created, this token is no longer needed."
  echo ""
else
  echo "==> $ENV_FILE already exists, skipping."
fi
echo ""

# 4. Run database migrations
echo "==> Running database migrations..."
npm run db:generate --prefix "$ROOT_DIR/app" 2>/dev/null || true
npm run db:migrate --prefix "$ROOT_DIR/app"
echo ""

# 4b. Seed demo connectors and dashboards
echo "==> Seeding demo connectors and dashboards..."
node "$ROOT_DIR/scripts/seed-demo.mjs"
echo ""

# 5. Check if first admin setup is needed
echo "==> Checking neoboard user data..."
USER_COUNT=$(docker exec neoboard-postgres psql -U neoboard -d neoboard -tAc "SELECT count(*) FROM \"user\"" 2>/dev/null || echo "0")
if [ "$USER_COUNT" = "0" ] || [ -z "$USER_COUNT" ]; then
  echo "    No users found — seed script may have failed."
  echo "    Visit http://localhost:3000/signup to create admin manually."
else
  echo "    Found $USER_COUNT user(s)."
  echo "    Login: admin@neoboard.local / admin123"
fi
echo ""

# 6. Start dev server
echo "==> Starting development server..."
echo "    App:       http://localhost:3000"
echo "    Storybook: npm run storybook (port 6006)"
echo ""
npm run dev --prefix "$ROOT_DIR"