#!/bin/bash
# Stop hook: deterministic completion gate.
#
# Replaces a prompt-type hook that invoked Haiku on EVERY turn-completion and
# re-read the (growing) transcript each time (#922). That cost compounded over
# long sessions for little signal: lint already auto-runs on every edit
# (format-and-lint.sh PostToolUse), and the real risk — UI changed without
# Playwright — is tracked deterministically by the .e2e-needed marker.
#
# This hook blocks "stop" only when UI files were edited but E2E has not run
# this session. Zero model cost; more reliable than asking a model to re-derive
# the same fact from the transcript.

INPUT=$(cat)

# Loop guard: if we already blocked once this stop cycle, allow.
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active // false')" = "true" ]; then
  exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -z "$PROJECT_DIR" ] && exit 0

MARKER="$PROJECT_DIR/.claude/.e2e-needed"
# No UI edits pending E2E → nothing to flag, stop is fine.
[ ! -f "$MARKER" ] && exit 0

COUNT=$(sort -u "$MARKER" | wc -l | tr -d ' ')
REASON="UI file(s) were edited (${COUNT}) but Playwright E2E has not run this session. Run 'cd app && npx playwright test' for the affected specs before stopping (or, if this work isn't ready to verify, say so)."

# Stop-control JSON: block this stop with a reason.
jq -cn --arg r "$REASON" '{decision:"block", reason:$r}'
exit 0
