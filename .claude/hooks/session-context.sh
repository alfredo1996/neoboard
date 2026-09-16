#!/bin/bash
# Hook E: Inject useful context at session start
# Event: SessionStart (startup)
#
# Claude Code's own session snapshot already carries the branch, working-tree
# status and recent commits. This adds what it leaves out: distance from the
# upstream, and the branch's open PR.

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -z "$PROJECT_DIR" ] && exit 0
cd "$PROJECT_DIR" || exit 0

BRANCH=$(git branch --show-current 2>/dev/null)

TRACKING=$(git rev-parse --abbrev-ref "@{upstream}" 2>/dev/null)
if [ -n "$TRACKING" ]; then
  AHEAD=$(git rev-list --count "$TRACKING..HEAD" 2>/dev/null)
  BEHIND=$(git rev-list --count "HEAD..$TRACKING" 2>/dev/null)
  echo "Tracking: $TRACKING (ahead $AHEAD, behind $BEHIND)"
else
  echo "Tracking: no upstream set"
fi

# gh pr view also returns a branch's merged or closed PR; only an open one helps.
PR=$(gh pr view --json number,title,url,state \
  --jq 'select(.state == "OPEN") | "Open PR: #\(.number) — \(.title)\n\(.url)"' 2>/dev/null)
[ -n "$PR" ] && echo "$PR"

# Persist project dir as env var for other hooks via CLAUDE_ENV_FILE
if [ -n "$CLAUDE_ENV_FILE" ]; then
  echo "NEOBOARD_PROJECT_DIR=$PROJECT_DIR" >> "$CLAUDE_ENV_FILE"
  echo "NEOBOARD_BRANCH=$BRANCH" >> "$CLAUDE_ENV_FILE"
fi

exit 0
