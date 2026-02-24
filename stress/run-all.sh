#!/usr/bin/env bash
# =============================================================================
# NeoBoard — k6 stress test runner
#
# Fully automated:
#   1. Starts Docker containers if not running
#   2. Starts Next.js dev server if not running
#   3. Seeds a stress-test user (alice@example.com) into the dev DB if absent
#   4. Creates temporary Neo4j + PostgreSQL connections via the API
#   5. Acquires a session cookie
#   6. Runs all k6 suites sequentially
#   7. Cleans up temporary connections and stops the dev server
#
# Usage:
#   ./stress/run-all.sh
#
#   # Run against a different URL (skip startup logic):
#   BASE_URL="https://staging.example.com" SESSION_COOKIE="authjs.session-token=<v>" ./stress/run-all.sh
#
#   # Skip specific suites (space-separated):
#   SKIP="large-dashboard-queries concurrent-queries" ./stress/run-all.sh
#
#   # Keep the dev server alive after tests:
#   NO_STOP=1 ./stress/run-all.sh
#
# Environment variables:
#   BASE_URL        Target URL          (default: http://localhost:3000)
#   SESSION_COOKIE  Skip auto-login     (default: auto-acquired)
#   NEO4J_CONN_ID   Override Neo4j ID   (default: auto-created)
#   PG_CONN_ID      Override PG ID      (default: auto-created)
#   SKIP            Space-separated suite names to skip
#   RESULTS_DIR     Output directory    (default: stress/results/<timestamp>)
#   NO_STOP         Set to "1" to leave dev server running after tests
# =============================================================================

set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
RESET='\033[0m'

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
APP_DIR="${REPO_DIR}/app"

# ── Config ────────────────────────────────────────────────────────────────────
BASE_URL="${BASE_URL:-http://localhost:3000}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
RESULTS_DIR="${RESULTS_DIR:-${SCRIPT_DIR}/results/${TIMESTAMP}}"
SKIP="${SKIP:-}"
NO_STOP="${NO_STOP:-0}"

# Stress-test account (seeded automatically into the dev DB if absent).
# Password is "password123" — bcrypt hash taken from init-test.sql (cost=12).
STRESS_EMAIL="k6-stress@neoboard.local"
STRESS_PASSWORD="password123"
STRESS_HASH='$2b$12$Y9ET62vxVM7zf3tXwTQHSuJ4j3RqlZziI35aVgZzcL8bWBDcAM5b6'

# Connection IDs — auto-created via API if not overridden
NEO4J_CONN_ID="${NEO4J_CONN_ID:-}"
PG_CONN_ID="${PG_CONN_ID:-}"

# Tracks resources created by this script so we can clean them up
CREATED_NEO4J_CONN=""
CREATED_PG_CONN=""
DEV_SERVER_PID=""
DEV_SERVER_LOG="${RESULTS_DIR}/dev-server.log"
COOKIE_JAR=""

mkdir -p "${RESULTS_DIR}"

# ── Helpers ───────────────────────────────────────────────────────────────────
log()  { echo -e "${BLUE}[k6-runner]${RESET} $*"; }
ok()   { echo -e "${GREEN}[k6-runner]${RESET} $*"; }
warn() { echo -e "${YELLOW}[k6-runner]${RESET} $*"; }
fail() { echo -e "${RED}[k6-runner]${RESET} $*"; }

is_skipped() {
  local name="$1"
  for s in $SKIP; do [[ "$s" == "$name" ]] && return 0; done
  return 1
}

app_is_up() {
  curl -sf "${BASE_URL}/api/auth/csrf" -o /dev/null 2>/dev/null
}

SESSION_COOKIE="${SESSION_COOKIE:-}"

# ── Cleanup on exit ───────────────────────────────────────────────────────────
cleanup() {
  # Delete temporary connections created by this script
  if [[ -n "$SESSION_COOKIE" ]]; then
    for conn_id in "$CREATED_NEO4J_CONN" "$CREATED_PG_CONN"; do
      if [[ -n "$conn_id" ]]; then
        log "Deleting temporary connection ${conn_id} ..."
        curl -sf -X DELETE "${BASE_URL}/api/connections/${conn_id}" \
          -H "Cookie: ${SESSION_COOKIE}" -o /dev/null 2>/dev/null || true
      fi
    done
  fi

  # Stop dev server if we started it
  if [[ -n "$DEV_SERVER_PID" && "$NO_STOP" != "1" ]]; then
    log "Stopping dev server (PID ${DEV_SERVER_PID}) ..."
    kill "${DEV_SERVER_PID}" 2>/dev/null || true
    sleep 1
    pkill -P "${DEV_SERVER_PID}" 2>/dev/null || true
    ok "Dev server stopped."
  fi

  # Remove cookie jar
  [[ -n "$COOKIE_JAR" && -f "$COOKIE_JAR" ]] && rm -f "${COOKIE_JAR}"
}
trap cleanup EXIT INT TERM

# ── Dependency check ──────────────────────────────────────────────────────────
if ! command -v k6 &>/dev/null; then
  fail "k6 is not installed."
  echo "  macOS:   brew install k6"
  echo "  Windows: winget install k6"
  echo "  Linux:   https://k6.io/docs/get-started/installation/"
  exit 1
fi
log "k6 $(k6 version | head -1)"

# ── Start infrastructure (Docker) ─────────────────────────────────────────────
if [[ "$BASE_URL" == *"localhost"* || "$BASE_URL" == *"127.0.0.1"* ]]; then
  COMPOSE_FILE=""
  for candidate in \
    "${REPO_DIR}/docker/docker-compose.yml" \
    "${REPO_DIR}/docker-compose.yml" \
    "${REPO_DIR}/compose.yml"; do
    [[ -f "$candidate" ]] && { COMPOSE_FILE="$candidate"; break; }
  done

  if command -v docker &>/dev/null && [[ -n "$COMPOSE_FILE" ]]; then
    log "Starting Docker containers ..."
    docker compose -f "${COMPOSE_FILE}" up -d 2>&1 | sed 's/^/  /' || true
    ok "Docker containers are up."
  else
    warn "docker not found or no compose file — skipping container startup."
  fi
fi

# ── Seed stress-test user into dev DB ────────────────────────────────────────
# This uses docker exec so it works even before the app is running.
# The user is only created if it doesn't already exist.
if [[ "$BASE_URL" == *"localhost"* || "$BASE_URL" == *"127.0.0.1"* ]]; then
  if command -v docker &>/dev/null && docker ps --format '{{.Names}}' 2>/dev/null | grep -q "neoboard-postgres"; then
    log "Ensuring stress-test user exists in dev DB ..."
    docker exec neoboard-postgres psql -U neoboard -d neoboard -c \
      "INSERT INTO \"user\" (id, name, email, \"passwordHash\", role)
       VALUES ('user-k6-stress', 'k6 Stress', '${STRESS_EMAIL}', '${STRESS_HASH}', 'admin')
       ON CONFLICT (email) DO NOTHING;" \
      > /dev/null 2>&1 && ok "Stress-test user ready." || warn "Could not seed user (non-fatal)."
  fi
fi

# ── Start Next.js dev server if not already running ───────────────────────────
if app_is_up; then
  ok "App already running at ${BASE_URL} — skipping startup."
else
  if [[ "$BASE_URL" != *"localhost"* && "$BASE_URL" != *"127.0.0.1"* ]]; then
    fail "App is not reachable at ${BASE_URL}."
    echo "  Make sure the remote server is running and SESSION_COOKIE is set."
    exit 1
  fi

  log "Starting Next.js dev server (logs → ${DEV_SERVER_LOG}) ..."
  npm --prefix "${APP_DIR}" run dev > "${DEV_SERVER_LOG}" 2>&1 &
  DEV_SERVER_PID=$!

  log "Dev server PID: ${DEV_SERVER_PID} — waiting for it to become ready ..."
  WAIT_MAX=120
  WAITED=0
  until app_is_up; do
    if ! kill -0 "${DEV_SERVER_PID}" 2>/dev/null; then
      fail "Dev server exited unexpectedly. Logs:"
      tail -30 "${DEV_SERVER_LOG}" | sed 's/^/  /'
      exit 1
    fi
    if (( WAITED >= WAIT_MAX )); then
      fail "Dev server not ready after ${WAIT_MAX}s. Logs:"
      tail -30 "${DEV_SERVER_LOG}" | sed 's/^/  /'
      exit 1
    fi
    sleep 2; (( WAITED += 2 ))
    log "  ... still waiting (${WAITED}s)"
  done
  ok "Dev server is ready (${WAITED}s)."
fi

# ── Acquire session cookie ────────────────────────────────────────────────────
if [[ -z "$SESSION_COOKIE" ]]; then
  log "Logging in as ${STRESS_EMAIL} ..."

  COOKIE_JAR="$(mktemp /tmp/authjs-cookies.XXXXXX)"

  CSRF=$(curl -sf -c "${COOKIE_JAR}" "${BASE_URL}/api/auth/csrf" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['csrfToken'])" 2>/dev/null || true)

  [[ -z "$CSRF" ]] && { fail "Could not fetch CSRF token."; exit 1; }

  ENCODED_EMAIL="${STRESS_EMAIL/@/%40}"

  LOGIN_RESPONSE=$(curl -sf -b "${COOKIE_JAR}" -c "${COOKIE_JAR}" -D - \
    -X POST "${BASE_URL}/api/auth/callback/credentials" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "email=${ENCODED_EMAIL}&password=${STRESS_PASSWORD}&csrfToken=${CSRF}&json=true" \
    2>/dev/null || true)

  if echo "$LOGIN_RESPONSE" | grep -qi "error="; then
    REASON=$(echo "$LOGIN_RESPONSE" | grep -i "location:" | grep -oi "error=[^&[:space:]]*" | head -1)
    fail "Login failed (${REASON:-unknown})."
    echo "  If the dev DB was just created, re-run — the seed may need a moment to apply."
    echo "  Or pass SESSION_COOKIE manually: SESSION_COOKIE=\"authjs.session-token=<v>\" ./stress/run-all.sh"
    exit 1
  fi

  RAW_COOKIE=$(echo "$LOGIN_RESPONSE" \
    | grep -i "set-cookie" | grep -i "session-token" \
    | sed 's/.*[Ss]ession-token=\([^;]*\).*/\1/' | head -1 | tr -d '[:space:]' || true)

  [[ -z "$RAW_COOKIE" ]] && RAW_COOKIE=$(grep -i "session-token" "${COOKIE_JAR}" \
    | awk '{print $NF}' | head -1 | tr -d '[:space:]' || true)

  if [[ -z "$RAW_COOKIE" ]]; then
    fail "Login succeeded but session cookie not found in response."
    exit 1
  fi

  COOKIE_NAME=$(grep -io "authjs.session-token\|next-auth.session-token" "${COOKIE_JAR}" | head -1 \
    || echo "authjs.session-token")
  SESSION_COOKIE="${COOKIE_NAME}=${RAW_COOKIE}"
  ok "Logged in — cookie: ${COOKIE_NAME}"
fi

log "Cookie: <redacted>"

AUTH_HEADER="Cookie: ${SESSION_COOKIE}"

# ── Create temporary test connections ─────────────────────────────────────────
# Only create connections if IDs were not provided via env vars
if [[ -z "$NEO4J_CONN_ID" ]]; then
  log "Creating temporary Neo4j connection ..."
  NEO4J_RESP=$(curl -sf -X POST "${BASE_URL}/api/connections" \
    -H "${AUTH_HEADER}" -H "Content-Type: application/json" \
    -d '{
      "name": "k6-stress-neo4j (auto-cleanup)",
      "type": "neo4j",
      "config": {
        "uri":      "bolt://localhost:7687",
        "username": "neo4j",
        "password": "neoboard123"
      }
    }' 2>/dev/null || true)

  NEO4J_CONN_ID=$(echo "$NEO4J_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || true)
  if [[ -z "$NEO4J_CONN_ID" ]]; then
    fail "Failed to create Neo4j connection: ${NEO4J_RESP}"
    exit 1
  fi
  CREATED_NEO4J_CONN="$NEO4J_CONN_ID"
  ok "Neo4j connection: ${NEO4J_CONN_ID}"
fi

if [[ -z "$PG_CONN_ID" ]]; then
  log "Creating temporary PostgreSQL connection ..."
  PG_RESP=$(curl -sf -X POST "${BASE_URL}/api/connections" \
    -H "${AUTH_HEADER}" -H "Content-Type: application/json" \
    -d '{
      "name": "k6-stress-pg (auto-cleanup)",
      "type": "postgresql",
      "config": {
        "uri":      "postgresql://localhost:5432/movies",
        "username": "neoboard",
        "password": "neoboard",
        "database": "movies"
      }
    }' 2>/dev/null || true)

  PG_CONN_ID=$(echo "$PG_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || true)
  if [[ -z "$PG_CONN_ID" ]]; then
    fail "Failed to create PostgreSQL connection: ${PG_RESP}"
    exit 1
  fi
  CREATED_PG_CONN="$PG_CONN_ID"
  ok "PostgreSQL connection: ${PG_CONN_ID}"
fi

# ── Suite definitions ─────────────────────────────────────────────────────────
# Format: "name|script|extra_env"   (extra_env = ^-separated KEY=VALUE pairs)
# Use ^ as delimiter so values that contain spaces (e.g. QUERY=RETURN 1 AS value)
# are not broken by word-splitting in the parser loop below.
SUITES=(
  "dashboard-list|scripts/dashboard-list.js|"
  "query-exec-neo4j|scripts/query-exec.js|CONNECTION_ID=${NEO4J_CONN_ID}^QUERY=RETURN 1 AS value"
  "query-exec-pg|scripts/query-exec.js|CONNECTION_ID=${PG_CONN_ID}^QUERY=SELECT 1 AS value"
  "large-dashboard|scripts/large-dashboard.js|"
  "large-dashboard-queries|scripts/large-dashboard-queries.js|CONNECTION_ID=${NEO4J_CONN_ID}"
  "concurrent-queries|scripts/concurrent-queries.js|NEO4J_CONN_ID=${NEO4J_CONN_ID}^PG_CONN_ID=${PG_CONN_ID}"
)

# ── Run loop ──────────────────────────────────────────────────────────────────
PASS=()
FAIL=()
SKIP_LIST=()

echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  NeoBoard k6 stress suite — ${TIMESTAMP}${RESET}"
echo -e "${BOLD}  Target      : ${BASE_URL}${RESET}"
echo -e "${BOLD}  Neo4j conn  : ${NEO4J_CONN_ID}${RESET}"
echo -e "${BOLD}  PG conn     : ${PG_CONN_ID}${RESET}"
echo -e "${BOLD}  Results     : ${RESULTS_DIR}${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════════════════${RESET}"
echo ""

for entry in "${SUITES[@]}"; do
  IFS='|' read -r name script extra_env <<< "$entry"

  echo -e "${BOLD}── Suite: ${name} ──────────────────────────────────────${RESET}"

  if is_skipped "$name"; then
    warn "SKIPPED (in \$SKIP list)"
    SKIP_LIST+=("$name")
    echo ""
    continue
  fi

  ENV_FLAGS=("-e" "SESSION_COOKIE=${SESSION_COOKIE}" "-e" "BASE_URL=${BASE_URL}")
  if [[ -n "$extra_env" ]]; then
    # Split on ^ so KEY=VALUE pairs whose values contain spaces are preserved
    IFS='^' read -ra ENV_PAIRS <<< "$extra_env"
    for kv in "${ENV_PAIRS[@]}"; do
      ENV_FLAGS+=("-e" "$kv")
    done
  fi

  set +e
  k6 run \
    "${ENV_FLAGS[@]}" \
    --out "json=${RESULTS_DIR}/${name}.json" \
    --summary-export "${RESULTS_DIR}/${name}-summary.txt" \
    "${SCRIPT_DIR}/${script}" \
    2>&1 | tee "${RESULTS_DIR}/${name}.log"
  EXIT_CODE=$?
  set -e

  if [[ $EXIT_CODE -eq 0 ]]; then
    ok "PASSED ✓"
    PASS+=("$name")
  else
    fail "FAILED ✗ (exit ${EXIT_CODE})"
    FAIL+=("$name")
  fi
  echo ""
done

# ── Final summary ─────────────────────────────────────────────────────────────
echo -e "${BOLD}═══════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  Results summary${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════════════════${RESET}"

for name in "${PASS[@]:-}";      do [[ -n "$name" ]] && echo -e "  ${GREEN}✓ PASS${RESET}  ${name}"; done
for name in "${FAIL[@]:-}";      do [[ -n "$name" ]] && echo -e "  ${RED}✗ FAIL${RESET}  ${name}"; done
for name in "${SKIP_LIST[@]:-}"; do [[ -n "$name" ]] && echo -e "  ${YELLOW}– SKIP${RESET}  ${name}"; done

echo ""
echo -e "  Logs & reports: ${RESULTS_DIR}/"
echo ""

if [[ ${#FAIL[@]} -gt 0 ]]; then
  fail "${#FAIL[@]} suite(s) failed."
  exit 1
else
  ok "All suites passed."
  exit 0
fi
