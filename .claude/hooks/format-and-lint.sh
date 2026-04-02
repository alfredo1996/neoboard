#!/bin/bash
# Auto-format and lint TypeScript files after edits
# Reads file path from stdin JSON (PostToolUse provides tool_input)
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.filePath // empty')
[ -z "$FILE_PATH" ] && exit 0

# Only process TypeScript files
echo "$FILE_PATH" | grep -qE '\.(ts|tsx)$' || exit 0

# Run prettier first
npx prettier --write "$FILE_PATH" 2>/dev/null || true

# Determine package and run appropriate linter
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
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