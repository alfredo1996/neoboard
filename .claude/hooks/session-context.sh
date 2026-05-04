#!/bin/bash
# Hook E: Inject useful context at session start
# Event: SessionStart (startup)

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -z "$PROJECT_DIR" ] && exit 0
cd "$PROJECT_DIR"

echo "=== Session Context ==="

# Docker health check
if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    echo "Docker: running"
  else
    echo "WARNING: Docker is installed but not running. Tests requiring Docker (connection/, E2E) will fail."
  fi
else
  echo "WARNING: Docker not found. Tests requiring Docker (connection/, E2E) will fail."
fi

# Current branch & tracking
BRANCH=$(git branch --show-current 2>/dev/null)
echo "Branch: $BRANCH"

TRACKING=$(git rev-parse --abbrev-ref "@{upstream}" 2>/dev/null)
if [ -n "$TRACKING" ]; then
  AHEAD=$(git rev-list --count "$TRACKING..HEAD" 2>/dev/null)
  BEHIND=$(git rev-list --count "HEAD..$TRACKING" 2>/dev/null)
  echo "Tracking: $TRACKING (ahead $AHEAD, behind $BEHIND)"
else
  echo "Tracking: no upstream set"
fi

# Working tree status
if git diff --quiet && git diff --cached --quiet; then
  UNTRACKED=$(git ls-files --others --exclude-standard | wc -l | tr -d ' ')
  if [ "$UNTRACKED" = "0" ]; then
    echo "Working tree: clean"
  else
    echo "Working tree: clean ($UNTRACKED untracked files)"
  fi
else
  MODIFIED=$(git diff --name-only | wc -l | tr -d ' ')
  STAGED=$(git diff --cached --name-only | wc -l | tr -d ' ')
  echo "Working tree: $MODIFIED modified, $STAGED staged"
fi

# Recent commits
echo ""
echo "Recent commits:"
git log --oneline -5 2>/dev/null

# Open PR on this branch
echo ""
PR_INFO=$(gh pr view --json number,title,state,url 2>/dev/null)
if [ $? -eq 0 ] && [ -n "$PR_INFO" ]; then
  PR_NUM=$(echo "$PR_INFO" | jq -r '.number')
  PR_TITLE=$(echo "$PR_INFO" | jq -r '.title')
  PR_STATE=$(echo "$PR_INFO" | jq -r '.state')
  PR_URL=$(echo "$PR_INFO" | jq -r '.url')
  echo "Open PR: #$PR_NUM — $PR_TITLE ($PR_STATE)"
  echo "URL: $PR_URL"
else
  echo "No open PR on this branch."
fi

# Persist project dir as env var for other hooks via CLAUDE_ENV_FILE
if [ -n "$CLAUDE_ENV_FILE" ]; then
  echo "NEOBOARD_PROJECT_DIR=$PROJECT_DIR" >> "$CLAUDE_ENV_FILE"
  echo "NEOBOARD_BRANCH=$BRANCH" >> "$CLAUDE_ENV_FILE"
fi

exit 0
