#!/bin/bash
# Hook A: Query Interpolation Guard
# Blocks string interpolation in SQL/Cypher query strings
# Rule: "ALWAYS use parameterized queries. NEVER interpolate user input into query strings."

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.filePath // empty')
[ -z "$FILE_PATH" ] && exit 0

# Only check files in connection/ and API routes (handle both absolute and relative paths)
case "$FILE_PATH" in
  *connection/src/*|*app/src/app/api/*) ;;
  *) exit 0 ;;
esac

# Only check TypeScript files
echo "$FILE_PATH" | grep -qE '\.(ts|tsx)$' || exit 0

# Get the content being written/edited
NEW_CONTENT=$(echo "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // empty')
[ -z "$NEW_CONTENT" ] && exit 0

# Detect template literals with interpolation that look like queries
# Check for SQL/Cypher keywords near ${...} interpolation
QUERY_KEYWORDS='(SELECT|INSERT|UPDATE|DELETE|MERGE|MATCH|CREATE|DROP|ALTER|CALL|RETURN|WITH|UNWIND)'
if echo "$NEW_CONTENT" | grep -qiE "${QUERY_KEYWORDS}" && echo "$NEW_CONTENT" | grep -qF '${'; then
  # Confirm it's interpolation inside a template literal (backtick string), not just a standalone ${
  # Look for lines that have both a query keyword and ${...} pattern
  if echo "$NEW_CONTENT" | grep -iE "${QUERY_KEYWORDS}" | grep -qF '${'; then
    echo "BLOCKED: Detected string interpolation (\${...}) near a query keyword." >&2
    echo "Rule: ALWAYS use parameterized queries. NEVER interpolate user input into query strings." >&2
    echo "Use query parameters (\$1, \$2 for PostgreSQL or \$paramName for Neo4j) instead." >&2
    exit 2
  fi
fi

# Detect string concatenation with query keywords
# Pattern: a quoted string containing a query keyword, followed by + (concat operator)
if echo "$NEW_CONTENT" | grep -iE "${QUERY_KEYWORDS}" | grep -qE '["\"][[:space:]]*\+[[:space:]]'; then
  echo "BLOCKED: Detected string concatenation in what appears to be a query." >&2
  echo "Rule: ALWAYS use parameterized queries. NEVER interpolate user input." >&2
  exit 2
fi

exit 0
