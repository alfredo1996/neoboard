#!/bin/bash
# Hook A: Query Interpolation Guard
# Blocks string interpolation and concatenation in SQL/Cypher query strings.
# Rule: "ALWAYS use parameterized queries. NEVER interpolate user input into query strings."
#
# Keywords match in UPPER CASE only. Matching any case blocked ordinary lines
# such as an error message that interpolates an id next to `return` (#1843).
# ponytail: lowercase SQL is not caught here; code review and the parameterised drivers cover it.

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

KEYWORDS='SELECT|INSERT|UPDATE|DELETE|MERGE|MATCH|CREATE|DROP|ALTER|CALL|RETURN|WITH|UNWIND'

# A template literal, single- or multi-line, holding both ${ and a query keyword.
printf '%s' "$NEW_CONTENT" | KEYWORDS="$KEYWORDS" perl -0777 -ne '
  while (/`([^`]*)`/g) {
    my $s = $1;
    exit 2 if index($s, "\${") >= 0 && $s =~ /\b(?:$ENV{KEYWORDS})\b/;
  }'
if [ $? -eq 2 ]; then
  echo "BLOCKED: Detected string interpolation (\${...}) in what appears to be a query." >&2
  echo "Rule: ALWAYS use parameterized queries. NEVER interpolate user input into query strings." >&2
  echo "Use query parameters (\$1, \$2 for PostgreSQL or \$paramName for Neo4j) instead." >&2
  exit 2
fi

# A quoted string holding a query keyword, followed by the + concat operator.
if printf '%s\n' "$NEW_CONTENT" | grep -qE "[\"'][^\"']*\b($KEYWORDS)\b[^\"']*[\"'][[:space:]]*\+"; then
  echo "BLOCKED: Detected string concatenation in what appears to be a query." >&2
  echo "Rule: ALWAYS use parameterized queries. NEVER interpolate user input." >&2
  exit 2
fi

exit 0
