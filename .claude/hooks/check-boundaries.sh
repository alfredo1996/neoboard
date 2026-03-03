#!/bin/bash
# Enforce package boundary rules from CLAUDE.md
# - component/ must NOT import from app/ or connection/
# - connection/ must NOT import React, app/, or component/
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.filePath // empty')
[ -z "$FILE_PATH" ] && exit 0

# Get the content being written
NEW_CONTENT=$(echo "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // empty')
[ -z "$NEW_CONTENT" ] && exit 0

# component/ must NOT import from app/ or connection/
if [[ "$FILE_PATH" == *"/component/src/"* ]]; then
  if echo "$NEW_CONTENT" | grep -qE "(from|import|require)[[:space:]]*['\"].*/(app|connection)/|(from|import|require)[[:space:]]*['\"]@/(app|connection)"; then
    echo "BLOCKED: component/ cannot import from app/ or connection/. See CLAUDE.md architecture rules." >&2
    exit 2
  fi
fi

# connection/ must NOT import from app/, component/, or React
if [[ "$FILE_PATH" == *"/connection/src/"* ]]; then
  if echo "$NEW_CONTENT" | grep -qE "(from|import|require)[[:space:]]*['\"]react(-dom)?['\"/]|(from|import|require)[[:space:]]*['\"].*/(app|component)/|(from|import|require)[[:space:]]*['\"]@/(app|component)"; then
    echo "BLOCKED: connection/ cannot import React, app/, or component/. See CLAUDE.md architecture rules." >&2
    exit 2
  fi
fi

exit 0
