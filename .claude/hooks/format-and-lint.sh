#!/bin/bash
# PostToolUse Edit|Write: format and lint a TypeScript file after Claude edits it.
# Never blocks the edit. Errors `eslint --fix` cannot resolve go back to Claude
# as additionalContext, so they are fixed now rather than found at commit (#923).
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.filePath // empty')
[ -z "$FILE_PATH" ] && exit 0

# Only process TypeScript files
echo "$FILE_PATH" | grep -qE '\.(ts|tsx)$' || exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -z "$PROJECT_DIR" ] && exit 0
cd "$PROJECT_DIR" || exit 0

# --no-install: never download a tool mid-edit.
npx --no-install prettier --write "$FILE_PATH" >/dev/null 2>&1

# The root flat config lints every package (#1547). For app/ this hook used to
# call the framework's own lint command, which Next.js 16 removed (#1843).
LINT=$(npx --no-install eslint --fix "$FILE_PATH" 2>&1) && exit 0
case "$LINT" in
  ""|*"could not determine executable"*) exit 0 ;; # no ESLint installed in this checkout
esac

REMAINING=$(printf '%s\n' "$LINT" | grep -v '^[[:space:]]*$' | head -20)
jq -cn --arg file "$FILE_PATH" --arg out "$REMAINING" \
  '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: "ESLint errors remain in \($file) after --fix:\n\($out)"}}'
exit 0
