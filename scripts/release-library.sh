#!/usr/bin/env bash
# Verifies a library release tag (#1876) and extracts its changelog section.
# Run from the repo root by .github/workflows/release-libraries.yml (verify and
# github-release jobs) and by scripts/__tests__/release-workflow.test.mjs.
#
#   release-library.sh @neoboard/cli@1.2.3
#
# Writes name, dir and version to $GITHUB_OUTPUT and the changelog section to
# $RELEASE_BODY. Fails on anything but a plain X.Y.Z tag for a known package
# whose package.json and CHANGELOG.md agree. Unlike the product release there
# is no fallback text: a library release without notes does not ship.
set -euo pipefail

TAG="${1:?usage: release-library.sh <tag>}"
OUT="${GITHUB_OUTPUT:-/dev/null}"
BODY_FILE="${RELEASE_BODY:-/tmp/release-body.md}"

fail() {
  echo "::error::$1"
  exit 1
}

[[ "$TAG" =~ ^(@neoboard/[a-z-]+)@([0-9]+\.[0-9]+\.[0-9]+)$ ]] ||
  fail "'$TAG' is not @neoboard/<package>@X.Y.Z"
NAME="${BASH_REMATCH[1]}"
VERSION="${BASH_REMATCH[2]}"

case "$NAME" in
  @neoboard/cli) DIR=cli ;;
  @neoboard/connector-sdk) DIR=connector-sdk ;;
  *) fail "$NAME is not a library released from this workflow" ;;
esac

PKG_NAME=$(node -p "require('./$DIR/package.json').name")
PKG_VERSION=$(node -p "require('./$DIR/package.json').version")
[ "$PKG_NAME" = "$NAME" ] || fail "$DIR/package.json is named $PKG_NAME, the tag says $NAME"
[ "$PKG_VERSION" = "$VERSION" ] || fail "$DIR/package.json is $PKG_VERSION, the tag says $VERSION"

[ -f "$DIR/CHANGELOG.md" ] || fail "$DIR/CHANGELOG.md does not exist"
# index() compares literally: the dots in a version are not regex wildcards.
BODY=$(awk -v h="## [$VERSION]" 'index($0, h) == 1 { found = 1; next } /^## \[/ { if (found) exit } found { print }' "$DIR/CHANGELOG.md")
[ -n "$(echo "$BODY" | tr -d '[:space:]')" ] || fail "$DIR/CHANGELOG.md has no '## [$VERSION]' section with content"
echo "$BODY" >"$BODY_FILE"

{
  echo "name=$NAME"
  echo "dir=$DIR"
  echo "version=$VERSION"
} >>"$OUT"
