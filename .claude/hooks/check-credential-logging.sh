#!/bin/bash
# Hook B: Credential Logging Guard
# Blocks console.log/warn/error of credential-related variables
# Rule: "NEVER log decrypted credentials."

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.filePath // empty')
[ -z "$FILE_PATH" ] && exit 0

# Only check TypeScript files in app/ and connection/ (handle both absolute and relative paths)
case "$FILE_PATH" in
  *app/src/*|*connection/src/*) ;;
  *) exit 0 ;;
esac
echo "$FILE_PATH" | grep -qE '\.(ts|tsx)$' || exit 0

# Get the content being written/edited
NEW_CONTENT=$(echo "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // empty')
[ -z "$NEW_CONTENT" ] && exit 0

# Credential-related identifiers (case-insensitive)
CRED_PATTERN='(password|passwd|secret|credential|apiKey|api_key|encryptionKey|encryption_key|decrypted|privateKey|private_key|accessToken|access_token|refreshToken|refresh_token)'

# Detect console.log/warn/error/debug containing credential identifiers
if echo "$NEW_CONTENT" | grep -iE "console\.(log|warn|error|debug|info)" | grep -qiE "${CRED_PATTERN}"; then
  echo "BLOCKED: Detected logging of credential-related variable." >&2
  echo "Rule: NEVER log decrypted credentials. Remove the log statement or redact sensitive data." >&2
  exit 2
fi

exit 0
