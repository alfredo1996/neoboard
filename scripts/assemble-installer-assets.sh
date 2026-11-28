#!/bin/sh
# Turn a directory of built CLI binaries into the release's installer assets
# (#1314): install.sh with this release's version pinned into it, and a
# SHA256SUMS over the binaries. Used by release.yml on a tag and by the
# web-installer CI job on a PR, so the step that only a tag would run is the
# one CI exercises.
#
#   scripts/assemble-installer-assets.sh 1.9.2 dist/
#
# DIR must already hold the neoboard-<os>-<arch> binaries.
set -eu

[ $# -eq 2 ] || { echo "usage: $0 VERSION DIR" >&2; exit 2; }
VERSION="$1"
DIR="$2"
HERE=$(cd "$(dirname "$0")" && pwd)

printf '%s' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$' ||
  { echo "not a release version: $VERSION" >&2; exit 2; }
set -- "$DIR"/neoboard-*
[ -f "$1" ] || { echo "no neoboard-* binaries in $DIR" >&2; exit 1; }

# The npm fallback installs the CLI package as it stood at this tag, not "latest".
NPM_VERSION=$(sed -n 's/^  "version": "\([^"]*\)".*/\1/p' "$HERE/../cli/package.json" | head -1)
[ -n "$NPM_VERSION" ] || { echo "no version in cli/package.json" >&2; exit 1; }
sed -e "s/^NB_PINNED_VERSION=\"@VERSION@\"/NB_PINNED_VERSION=\"$VERSION\"/" \
  -e "s/^NB_NPM_VERSION=\"@NPM_VERSION@\"/NB_NPM_VERSION=\"$NPM_VERSION\"/" \
  "$HERE/web-installer.sh" > "$DIR/install.sh"
grep -q "^NB_PINNED_VERSION=\"$VERSION\"" "$DIR/install.sh" ||
  { echo "could not pin the version into install.sh" >&2; exit 1; }
if grep -Eq '@(NPM_)?VERSION@"' "$DIR/install.sh"; then
  echo "install.sh still has an unsubstituted version" >&2
  exit 1
fi

# sha256sum on Linux runners, shasum on macOS; the list is names only, so the
# file can be checked with `sha256sum -c` from the directory.
(
  cd "$DIR"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum neoboard-* > SHA256SUMS
  else
    shasum -a 256 neoboard-* > SHA256SUMS
  fi
)
