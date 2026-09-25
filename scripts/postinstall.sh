#!/bin/sh
# Root postinstall: build the CLI and link it as the machine's global
# `neoboard`. Skipped in CI and in a checkout without the CLI sources.
#
# A linked git worktree builds the CLI but does not link it (#1914): the global
# command stays on the primary checkout instead of following whichever
# throwaway worktree ran `npm ci` last, and breaking when that one is removed.
# To use a worktree's CLI on purpose, run `npm link ./cli` in it by hand.

[ -n "$CI" ] && exit 0
[ -d cli/src ] || exit 0

npm -w cli run build || exit

if [ "$(git rev-parse --path-format=absolute --git-dir 2>/dev/null)" != \
  "$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" ]; then
  echo "postinstall: linked git worktree, leaving the global neoboard CLI where it points (#1914)"
  exit 0
fi

env -u npm_config_prefix npm link ./cli
