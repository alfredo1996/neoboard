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
echo ""

# 2. Install dependencies
echo "==> Installing dependencies..."
npm install --prefix "$ROOT_DIR"
npm install --prefix "$ROOT_DIR/app"
npm install --prefix "$ROOT_DIR/component"
npm install --prefix "$ROOT_DIR/connection"
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

# 5. Done
echo "==> Setup complete!"
echo ""
echo "    Start the dev server:  npm run dev"
echo "    App:                   http://localhost:3000"
echo "    Storybook:             npm run storybook (port 6006)"
echo ""
echo "    Create your first admin at /signup using the bootstrap token above."
echo ""
echo "    Want demo data? Run: scripts/setup-local-demo.sh"
