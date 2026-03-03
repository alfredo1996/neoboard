#!/bin/bash
# Auto-format and lint TypeScript files after edits
FILE_PATH=$(echo "$CLAUDE_FILE_PATHS" | head -1)
[ -z "$FILE_PATH" ] && exit 0

# Only process TypeScript files
echo "$FILE_PATH" | grep -qE '\.(ts|tsx)$' || exit 0

# Run prettier first
npx prettier --write "$FILE_PATH" 2>/dev/null || true

# Determine package and run appropriate linter
PROJECT_DIR="$(git rev-parse --show-toplevel 2>/dev/null)"
[ -z "$PROJECT_DIR" ] && exit 0

REL_PATH="${FILE_PATH#$PROJECT_DIR/}"

if [[ "$REL_PATH" == app/* ]]; then
  cd "$PROJECT_DIR/app" && npx next lint --fix --file "${REL_PATH#app/}" 2>/dev/null || true
elif [[ "$REL_PATH" == component/* ]]; then
  cd "$PROJECT_DIR/component" && npx eslint --fix "$FILE_PATH" 2>/dev/null || true
elif [[ "$REL_PATH" == connection/* ]]; then
  cd "$PROJECT_DIR/connection" && npx eslint --fix "$FILE_PATH" 2>/dev/null || true
fi

exit 0
