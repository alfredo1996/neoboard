#!/bin/bash
# Hook: Enforce E2E testing when UI files are edited
# Three modes:
#   mark          — PostToolUse Edit|Write: flag when UI files change
#   check-commit  — PreToolUse Bash: block git commit if E2E not run
#   clear-on-test — PostToolUse Bash: clear flag after playwright runs

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -z "$PROJECT_DIR" ] && exit 0
MARKER="$PROJECT_DIR/.claude/.e2e-needed"

case "$1" in
  mark)
    INPUT=$(cat)
    FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.filePath // empty')
    [ -z "$FILE_PATH" ] && exit 0
    case "$FILE_PATH" in
      */app/src/components/*|*/app/src/app/*)
        touch "$MARKER"
        if ! grep -qxF "$FILE_PATH" "$MARKER" 2>/dev/null; then
          echo "$FILE_PATH" >> "$MARKER"
        fi
        ;;
    esac
    ;;

  check-commit)
    INPUT=$(cat)
    CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
    # Only trigger on git commit commands
    echo "$CMD" | grep -qE '^\s*git commit' || exit 0
    [ ! -f "$MARKER" ] && exit 0
    COUNT=$(sort -u "$MARKER" | wc -l | tr -d ' ')
    echo "BLOCKED: $COUNT UI file(s) were edited but Playwright E2E tests have not been run this session." >&2
    echo "Run first: cd app && npx playwright test" >&2
    echo "" >&2
    echo "Edited UI files:" >&2
    sort -u "$MARKER" | while read -r f; do echo "  - $f" >&2; done
    exit 2
    ;;

  clear-on-test)
    INPUT=$(cat)
    CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
    # Clear marker when playwright tests are run
    echo "$CMD" | grep -qE 'playwright test' || exit 0
    [ -f "$MARKER" ] && rm -f "$MARKER"
    ;;

  *)
    echo "Usage: enforce-e2e.sh <mark|check-commit|clear-on-test>" >&2
    exit 1
    ;;
esac

exit 0
