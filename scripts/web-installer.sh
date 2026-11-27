#!/bin/sh
# NeoBoard web installer (#1314):
#
#   curl -fsSL https://github.com/alfredo1996/neoboard/releases/latest/download/install.sh | sh
#
# Checks Docker, installs the `neoboard` CLI binary for this machine (checked
# against the release's SHA256SUMS, failing closed), then runs `neoboard setup`,
# which writes the secrets, starts the stack, waits for it and prints the URL
# and the first-run token. No root, no sudo, no telemetry. Read it first:
#
#   curl -fsSL https://github.com/alfredo1996/neoboard/releases/latest/download/install.sh -o install.sh
#   less install.sh && sh install.sh
#
# Environment (all optional):
#   NEOBOARD_VERSION   install this release instead of the one this script pins
#   NEOBOARD_DIR       where the install lives (default ./neoboard)
#   NEOBOARD_BIN_DIR   where the binary goes (default ~/.local/bin)
#
# Re-running is safe: docker/.env (the secrets) is never rewritten, the image
# version already recorded is kept, and the binary is replaced only when
# NEOBOARD_VERSION is given.
set -eu

# ---- Names: the one place to edit for the org transfer (#1213) and the rename (#1970)
NB_REPO="alfredo1996/neoboard"
NB_CMD="neoboard"
NB_NPM_PACKAGE="@neoboard/cli"
# release.yml replaces this with the tag's version when it publishes the script.
NB_PINNED_VERSION="@VERSION@"
# Test seam for CI: serve the assets locally. Anything but https, or http on
# loopback, is refused below.
NB_RELEASES="${NEOBOARD_RELEASES_URL:-https://github.com/$NB_REPO/releases}"
# ----

die() {
  printf 'neoboard install: %s\n' "$*" >&2
  exit 1
}
say() { printf '==> %s\n' "$*"; }

case "$NB_RELEASES" in
  https://*) ;;
  http://127.0.0.1:* | http://localhost:*) ;;
  *) die "refusing a non-HTTPS download base: $NB_RELEASES" ;;
esac

case "$(uname -s)" in
  Linux) os=linux ;;
  Darwin) os=darwin ;;
  *) die "this installer supports Linux and macOS. On Windows, run it inside WSL2 (https://learn.microsoft.com/windows/wsl/install) with Docker Desktop's WSL integration on." ;;
esac
case "$(uname -m)" in
  x86_64 | amd64) arch=x64 ;;
  arm64 | aarch64) arch=arm64 ;;
  *) arch="" ;;
esac

# ---- 1. Docker and Compose v2: the app is containers
if [ "$os" = darwin ]; then
  hint_install="Install Docker Desktop (https://docs.docker.com/desktop/setup/install/mac-install/ or: brew install --cask docker), then open it."
  hint_start="Open Docker Desktop and wait until it says it is running."
  hint_compose="Update Docker Desktop: Compose v2 ships with it."
else
  hint_install="Install Docker Engine: https://docs.docker.com/engine/install/"
  hint_start="Start it: sudo systemctl start docker"
  hint_compose="Install the Compose plugin: https://docs.docker.com/compose/install/linux/"
fi
command -v docker >/dev/null 2>&1 || die "Docker is not installed. $hint_install"
if ! docker_info=$(docker info 2>&1); then
  case "$docker_info" in
    *ermission*denied*) die "Docker needs more permission than this user has. Add yourself to the docker group (sudo usermod -aG docker \"\$USER\", then log in again). This installer never uses sudo." ;;
    *) die "The Docker daemon is not reachable. $hint_start" ;;
  esac
fi
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is missing. $hint_compose"

# ---- 2. Which release
VERSION="${NEOBOARD_VERSION:-$NB_PINNED_VERSION}"
VERSION="${VERSION#v}"
case "$VERSION" in
  *[!0-9A-Za-z.-]* | "" | @*) die "no usable version (got \"$VERSION\"). Set NEOBOARD_VERSION=1.9.2, or use the install.sh attached to a release." ;;
esac
printf '%s' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$' ||
  die "NEOBOARD_VERSION must look like 1.9.2 (got \"$VERSION\")."

# ---- 3. The CLI
BIN_DIR="${NEOBOARD_BIN_DIR:-$HOME/.local/bin}"
cli="$BIN_DIR/$NB_CMD"

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

install_binary() {
  asset="$NB_CMD-$os-$arch"
  base="$NB_RELEASES/download/v$VERSION"
  tmp=$(mktemp -d)
  say "Downloading $asset $VERSION"
  curl -fsSL "$base/$asset" -o "$tmp/$asset" || { rm -rf "$tmp"; die "could not download $base/$asset"; }
  curl -fsSL "$base/SHA256SUMS" -o "$tmp/SHA256SUMS" || { rm -rf "$tmp"; die "could not download $base/SHA256SUMS"; }
  want=$(awk -v f="$asset" '{ n = $2; sub(/^\*/, "", n) } n == f { print $1 }' "$tmp/SHA256SUMS")
  [ -n "$want" ] || { rm -rf "$tmp"; die "SHA256SUMS has no entry for $asset; nothing installed."; }
  got=$(sha256 "$tmp/$asset")
  [ "$want" = "$got" ] || { rm -rf "$tmp"; die "checksum mismatch for $asset (expected $want, got $got); nothing installed."; }
  mkdir -p "$BIN_DIR"
  chmod 755 "$tmp/$asset"
  mv "$tmp/$asset" "$cli"
  rm -rf "$tmp"
}

install_from_npm() {
  # No binary for this machine: the npm package is the same CLI, needs Node 20+.
  command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 &&
    [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ] ||
    die "no prebuilt binary for $(uname -s) $(uname -m), and Node 20+ with npm is not available for the npm fallback."
  say "No prebuilt binary for this machine; installing $NB_NPM_PACKAGE from npm"
  npm install -g "$NB_NPM_PACKAGE" || die "npm install -g failed. This installer never uses sudo; see https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally"
  cli="$NB_CMD"
}

if [ -z "$arch" ]; then
  install_from_npm
elif [ -x "$cli" ] && [ -z "${NEOBOARD_VERSION:-}" ]; then
  say "Keeping the installed $cli (set NEOBOARD_VERSION to change it)"
else
  install_binary
fi

# ---- 4. Set up
DIR="${NEOBOARD_DIR:-$PWD/$NB_CMD}"
case "$DIR" in /*) ;; *) DIR="$PWD/$DIR" ;; esac
mkdir -p "$DIR"
NEOBOARD_DIR="$DIR"
export NEOBOARD_DIR
# The release is pinned into docker/.env the first time, and moved only when asked.
if [ -n "${NEOBOARD_VERSION:-}" ] || [ ! -f "$DIR/docker/.env" ]; then
  NEOBOARD_VERSION="$VERSION"
  export NEOBOARD_VERSION
else
  unset NEOBOARD_VERSION
fi

say "Running: $NB_CMD setup (in $DIR)"
"$cli" setup || die "setup did not finish; see the messages above, then: $NB_CMD doctor"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    if [ "$cli" != "$NB_CMD" ]; then
      printf '\n%s is not on your PATH. Add this to your shell profile:\n  export PATH="%s:$PATH"\n' "$BIN_DIR" "$BIN_DIR"
    fi
    ;;
esac
