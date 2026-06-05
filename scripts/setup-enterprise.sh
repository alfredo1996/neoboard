#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# NeoBoard Enterprise — local-dev setup.
#
# Wires the private `@neoboard/enterprise` sibling repo into this checkout via
# `npm link`, so a developer can dogfood SSO and other gated features without
# remembering the six-step manual ritual.
#
# Usage:
#   ./scripts/setup-enterprise.sh            # do the thing
#   ./scripts/setup-enterprise.sh --dry-run  # print steps without running
#   ./scripts/setup-enterprise.sh --help     # this banner
#
# See CONTRIBUTING-enterprise.md for architecture rationale and env vars.
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SIBLING_DIR="$(cd "$ROOT_DIR/.." && pwd)/neoboard-enterprise"
ENTERPRISE_REPO="alfredo1996/neoboard-enterprise"

DRY_RUN=0

usage() {
  cat <<EOF
Usage: $(basename "$0") [--dry-run] [--help]

Sets up the @neoboard/enterprise sibling package for local development.

Options:
  --dry-run   Print the steps that would be executed without running them.
  --help      Show this message and exit.

The script expects (or creates) a sibling checkout at:
  $SIBLING_DIR

It uses 'gh repo clone' to honour your existing GitHub auth — so install the
GitHub CLI (https://cli.github.com) and run 'gh auth login' first.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *)
      echo "error: unknown flag: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

# step <description> <command...>
#   In dry-run mode, echo what would happen. Otherwise execute it.
step() {
  local desc="$1"; shift
  if [ "$DRY_RUN" -eq 1 ]; then
    printf "  [dry-run] %s\n    $ %s\n" "$desc" "$*"
  else
    printf "==> %s\n" "$desc"
    "$@"
  fi
}

require_gh() {
  if [ "$DRY_RUN" -eq 1 ]; then return 0; fi
  if ! command -v gh >/dev/null 2>&1; then
    cat >&2 <<EOF
error: GitHub CLI ('gh') not found.

Install from https://cli.github.com, then run:
  gh auth login

We use 'gh repo clone' so private-repo access works through your gh login
(no need to add SSH keys).
EOF
    exit 1
  fi
}

# Sibling repo: clone if absent / empty, otherwise reuse as-is. We do NOT
# 'git pull' — an active enterprise checkout may have uncommitted work and
# this script must never clobber it.
ensure_sibling() {
  local needs_clone=0
  if [ ! -d "$SIBLING_DIR" ]; then
    needs_clone=1
  elif [ ! -d "$SIBLING_DIR/.git" ] && [ -z "$(ls -A "$SIBLING_DIR" 2>/dev/null)" ]; then
    needs_clone=1
  elif [ ! -f "$SIBLING_DIR/package.json" ]; then
    # Has .git but no package.json — empty clone (placeholder). Re-clone in place.
    needs_clone=1
  fi

  if [ "$needs_clone" -eq 1 ]; then
    require_gh
    if [ -d "$SIBLING_DIR" ]; then
      step "Removing empty placeholder at $SIBLING_DIR" rm -rf "$SIBLING_DIR"
    fi
    step "Cloning $ENTERPRISE_REPO into $SIBLING_DIR" \
      gh repo clone "$ENTERPRISE_REPO" "$SIBLING_DIR"
  else
    printf "==> Reusing existing sibling checkout at %s\n" "$SIBLING_DIR"
  fi
}

# In dry-run mode we skip the on-disk check entirely so we can demo on any
# machine (CI, fresh clone, contributor laptop without gh).
if [ "$DRY_RUN" -eq 1 ]; then
  printf "==> Would ensure sibling checkout at %s\n" "$SIBLING_DIR"
  printf "    (clones %s via 'gh repo clone' when absent)\n" "$ENTERPRISE_REPO"
else
  ensure_sibling
fi

step "Installing enterprise dependencies" \
  npm install --prefix "$SIBLING_DIR"

step "Building @neoboard/enterprise" \
  npm --prefix "$SIBLING_DIR" run build

step "Registering @neoboard/enterprise globally (npm link)" \
  npm --prefix "$SIBLING_DIR" link

step "Linking @neoboard/enterprise into app/" \
  npm --prefix "$ROOT_DIR/app" link @neoboard/enterprise

# End banner — survives dry-run so the docs-flow can be inspected without
# touching anything.
cat <<EOF

✓ @neoboard/enterprise is wired into app/node_modules.

Next steps:

  1. Add to app/.env.local:

       NEOBOARD_EDITION=enterprise
       # SSO / OIDC (optional — for /settings/authentication):
       OIDC_ISSUER=http://localhost:8080/realms/neoboard
       OIDC_CLIENT_ID=neoboard
       OIDC_CLIENT_SECRET=<from your IdP>

  2. (Optional) Start a local Keycloak for SSO testing:

       docker compose -f docker/docker-compose.keycloak.yml up -d

  3. Restart the dev server:

       npm run dev

  4. Visit http://localhost:3000/settings/authentication to confirm at least
     one SSO provider is listed.

See CONTRIBUTING-enterprise.md for the full architecture rationale and
troubleshooting tips.
EOF
