#!/usr/bin/env bash
# --------------------------------------------------------------------------
# NeoBoard Demo Setup — bootstraps the CLI, then delegates to `neoboard demo`.
# Sets up services, installs deps, runs migrations, and seeds demo data.
# --------------------------------------------------------------------------
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CLI_BIN="$ROOT_DIR/cli/dist/index.js"

# Bootstrap: build the CLI if it hasn't been compiled yet
if [ ! -f "$CLI_BIN" ]; then
  echo "==> Bootstrapping NeoBoard CLI..."
  npm install --prefix "$ROOT_DIR"
  npm -w cli run build --prefix "$ROOT_DIR"
  echo ""
fi

# Delegate to CLI
node "$CLI_BIN" demo
