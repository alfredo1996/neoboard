#!/bin/bash
# Enforce package boundary rules from .claude/CLAUDE.md
# - component/ must NOT import from app/ or connection/
# - connection/ must NOT import React, app/, or component/
# - app/ and component/ must NOT gain a connector's name (#1894)
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.filePath // empty')
[ -z "$FILE_PATH" ] && exit 0

# Get the content being written
NEW_CONTENT=$(echo "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // empty')
[ -z "$NEW_CONTENT" ] && exit 0

# component/ must NOT import from app/ or connection/
if [[ "$FILE_PATH" == *"/component/src/"* ]]; then
  if echo "$NEW_CONTENT" | grep -qE "(from|import|require)[[:space:]]*['\"].*/(app|connection)/|(from|import|require)[[:space:]]*['\"]@/(app|connection)"; then
    echo "BLOCKED: component/ cannot import from app/ or connection/. See .claude/CLAUDE.md architecture rules." >&2
    exit 2
  fi
fi

# connection/ must NOT import from app/, component/, or React
if [[ "$FILE_PATH" == *"/connection/src/"* ]]; then
  if echo "$NEW_CONTENT" | grep -qE "(from|import|require)[[:space:]]*['\"]react(-dom)?['\"/]|(from|import|require)[[:space:]]*['\"].*/(app|component)/|(from|import|require)[[:space:]]*['\"]@/(app|component)"; then
    echo "BLOCKED: connection/ cannot import React, app/, or component/. See .claude/CLAUDE.md architecture rules." >&2
    exit 2
  fi
fi

# Connector agnosticism (#1894): app/ and component/ may know THAT connectors
# exist, never WHICH. The names come from the connectors themselves — the
# `type:`, `label:` and `uri` field `protocols:` of every
# connection/src/*/descriptor.ts (#1897 moved them there from plugin.ts) — so a
# new connector is covered with no edit here. Only an edit that ADDS names is
# blocked: migrating a line that already has one must stay possible.
# The gate is app/src/lib/__tests__/connector-agnostic.test.ts; keep the
# allowlist below in step with it.
case "$FILE_PATH" in
  */__tests__/* | *.test.ts | *.test.tsx | *.stories.tsx) ;;
  */app/src/lib/db/*) ;;                # the app's OWN metadata PostgreSQL
  */component/src/lib/cypher-lang/*) ;; # vendored grammar
  */app/src/* | */component/src/*)
    ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
    NAMES=$(
      {
        # The connector's OWN type and label: top-level keys, at 2-space
        # indent. A field's `type:` / `label:` sit deeper and are generic words
        # ("uri", "Username") the app must be able to say.
        grep -hoE '^[[:space:]]{2}(type|label):[[:space:]]*"[^"]+"' "$ROOT"/connection/src/*/descriptor.ts |
          sed -E 's/^[^"]*"//; s/"$//'
        # URI schemes: what a `protocols: [...]` list holds, on one line or many.
        awk '/protocols:/ { p = 1 } p { print } p && /\]/ { p = 0 }' "$ROOT"/connection/src/*/descriptor.ts |
          grep -oE '"[a-z][a-z0-9.-]*[+:]' | tr -d '"+:'
      } 2>/dev/null | sed -E 's/[][(){}.*+?^$|\\]/\\&/g' | sort -u | paste -sd '|' -
    )
    if [ -z "$NAMES" ]; then
      # Nothing derived means nothing is checked. Say so: a hook reading the
      # wrong file passes every edit, and silence looks exactly like that.
      echo "check-boundaries: no connector names found in connection/src/*/descriptor.ts — connector-agnosticism check skipped" >&2
      exit 0
    fi
    # Library names that merely contain a connector's name are not connectors.
    count() {
      sed -E 's#@neo4j-(nvl|cypher)/[A-Za-z0-9_-]+##g; /@codemirror\/lang-sql/d; s/dialect:[[:space:]]*PostgreSQL//g' |
        grep -oiE "$NAMES" | wc -l
    }
    if echo "$INPUT" | jq -e '.tool_input | has("new_string")' >/dev/null; then
      BEFORE=$(echo "$INPUT" | jq -r '.tool_input.old_string // empty' | count)
    else
      BEFORE=$(cat "$FILE_PATH" 2>/dev/null | count)
    fi
    AFTER=$(echo "$NEW_CONTENT" | count)
    if [ "$AFTER" -gt "$BEFORE" ]; then
      echo "BLOCKED: this edit names a connector ($(echo "$NEW_CONTENT" | grep -oiE "$NAMES" | sort -fu | paste -sd ',' -)) in app/ or component/. They may know THAT connectors exist, never WHICH — would this line change when connector N+1 is added? Read the fact from the registry / descriptor instead. See 'Connector Agnosticism' in .claude/CLAUDE.md." >&2
      exit 2
    fi
    ;;
esac

exit 0
