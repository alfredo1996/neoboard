#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/app/.env.local"

echo "==> NeoBoard Setup"
echo ""

# 1. Start PostgreSQL
echo "==> Starting PostgreSQL via Docker Compose..."
docker compose -f "$ROOT_DIR/docker-compose.yml" up -d
echo "    Waiting for PostgreSQL to be ready..."
until docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T postgres pg_isready -U neoboard > /dev/null 2>&1; do
  sleep 1
done
echo "    PostgreSQL is ready."
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

# 5. Start dev server
echo "==> Starting development server..."
echo "    App:       http://localhost:3000"
echo "    Storybook: npm run storybook (port 6006)"
echo ""
npm run dev --prefix "$ROOT_DIR"
