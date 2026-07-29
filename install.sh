#!/usr/bin/env bash
# --------------------------------------------------------------------------
# NeoBoard installer — bootstraps the CLI, then delegates to `neoboard setup`.
#
# Usage from a fresh clone:
#   bash install.sh
# Or after chmod +x:
#   ./install.sh
# --------------------------------------------------------------------------
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLI_BIN="$ROOT_DIR/cli/dist/index.js"

# Bootstrap: build the CLI if it hasn't been compiled yet.
#
# Run npm from inside the repo rather than with `--prefix "$ROOT_DIR"`. To npm,
# --prefix is the *global* install location, and it propagates into every
# lifecycle script's environment — so the root postinstall's `npm link ./cli`
# treated the repo as the global prefix and tried to write "$ROOT_DIR/lib",
# which does not exist. That failed every install from a clean clone (#1309).
if [ ! -f "$CLI_BIN" ]; then
  echo "==> Bootstrapping NeoBoard CLI..."
  (cd "$ROOT_DIR" && npm install && npm -w cli run build)
  echo ""
fi

# Bootstrap-only mode, for the CI guard that proves a clean clone can still
# install (#1309). Stops before `setup` so the check needs no Docker daemon.
if [ -n "${NEOBOARD_BOOTSTRAP_ONLY:-}" ]; then
  echo "==> Bootstrap complete (NEOBOARD_BOOTSTRAP_ONLY set) — skipping setup."
  exit 0
fi

# Delegate to CLI
node "$CLI_BIN" setup
