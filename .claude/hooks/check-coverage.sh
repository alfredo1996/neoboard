#!/bin/bash
# Hook G: Coverage Threshold Warning
# After test runs, warn if coverage drops below 80%
# Event: PostToolUse (Bash) — non-blocking, async

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
[ -z "$COMMAND" ] && exit 0

# Only activate for test commands
echo "$COMMAND" | grep -qE '(vitest|npm test|npm run test|npx vitest)' || exit 0

STDOUT=$(echo "$INPUT" | jq -r '.tool_result.stdout // empty')
[ -z "$STDOUT" ] && exit 0

# Look for coverage summary lines like "All files | 44.12 | ..."
LOW_COVERAGE=false
WARNING_MSG=""

while IFS= read -r line; do
  # Match vitest coverage table format: "All files | XX.XX |"
  if echo "$line" | grep -qE '^\s*(All files|Statements|Branches|Functions|Lines)\s*\|?\s*[0-9]+(\.[0-9]+)?'; then
    PCT=$(echo "$line" | grep -oE '[0-9]+(\.[0-9]+)?' | head -1)
    if [ -n "$PCT" ]; then
      INT_PCT=$(echo "$PCT" | cut -d. -f1)
      if [ "$INT_PCT" -lt 80 ] 2>/dev/null; then
        LOW_COVERAGE=true
        WARNING_MSG="${WARNING_MSG}  $(echo "$line" | xargs)\n"
      fi
    fi
  fi
done <<< "$STDOUT"

if [ "$LOW_COVERAGE" = true ]; then
  printf '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"WARNING: Coverage below 80%% target:\\n%s\\nConsider adding tests before committing."}}' "$WARNING_MSG"
fi

exit 0
