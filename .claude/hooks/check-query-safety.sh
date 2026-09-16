#!/bin/bash
# Hook A: Query Interpolation Guard
# Blocks string interpolation and concatenation in SQL/Cypher query strings.
# Rule: "ALWAYS use parameterized queries. NEVER interpolate user input into query strings."
#
# Matching is case-insensitive — both engines accept lowercase keywords — but
# it requires the SHAPE of a statement (select … from, insert into, match (…)
# rather than a lone keyword. A single any-case keyword blocked ordinary lines
# such as an error message interpolating an id next to `return` (#1843).

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

# Statement shapes, not single keywords. Kept in one place for both checks below.
SHAPES='\bselect\b[\s\S]*?\bfrom\b|\binsert\s+into\b|\bupdate\b[\s\S]*?\bset\b|\bdelete\s+from\b|\bmerge\s+into\b|\b(?:create|drop|alter)\s+(?:table|index|view|database|schema|constraint)\b|\bmatch\s*\(|\bmerge\s*\(|\bcreate\s*\(|\bdetach\s+delete\b|\bunwind\b|\bcall\s+\w+\.'

# A template literal, single- or multi-line, holding both ${ and a query shape.
printf '%s' "$NEW_CONTENT" | SHAPES="$SHAPES" perl -0777 -ne '
  my $shapes = qr/$ENV{SHAPES}/i;
  while (/`([^`]*)`/g) {
    my $s = $1;
    exit 2 if index($s, "\${") >= 0 && $s =~ $shapes;
  }'
if [ $? -eq 2 ]; then
  echo "BLOCKED: Detected string interpolation (\${...}) in what appears to be a query." >&2
  echo "Rule: ALWAYS use parameterized queries. NEVER interpolate user input into query strings." >&2
  echo "Use query parameters (\$1, \$2 for PostgreSQL or \$paramName for Neo4j) instead." >&2
  exit 2
fi

# A quoted string holding a query shape, followed by the + concat operator.
printf '%s' "$NEW_CONTENT" | SHAPES="$SHAPES" perl -0777 -ne '
  my $shapes = qr/$ENV{SHAPES}/i;
  while (/(["\x27])([^"\x27]*)\1\s*\+/g) {
    exit 2 if $2 =~ $shapes;
  }'
if [ $? -eq 2 ]; then
  echo "BLOCKED: Detected string concatenation in what appears to be a query." >&2
  echo "Rule: ALWAYS use parameterized queries. NEVER interpolate user input." >&2
  exit 2
fi

exit 0
