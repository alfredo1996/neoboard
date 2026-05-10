#!/bin/bash
# Hook: Prevent editing existing migration files (forward-only migrations)
# Rule: "Forward-only. Idempotent." — CLAUDE.md
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.filePath // empty')
[ -z "$FILE_PATH" ] && exit 0

# Only check migration files
case "$FILE_PATH" in
  *migrations/*.sql|*migrations/*.ts)
    # Allow creating NEW migration files (Write tool with no existing file)
    TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
    if [ "$TOOL_NAME" = "Write" ] && [ ! -f "$FILE_PATH" ]; then
      exit 0
    fi
    # Block editing existing migration files
    if [ -f "$FILE_PATH" ]; then
      echo "BLOCKED: Cannot edit existing migration file: $(basename "$FILE_PATH")" >&2
      echo "Rule: Migrations are forward-only. Create a new migration instead." >&2
      echo "Use: npm run db:generate" >&2
      exit 2
    fi
    ;;
esac

exit 0
