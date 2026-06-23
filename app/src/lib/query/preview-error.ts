/**
 * Map a raw preview-query error into a clear, user-facing message (#1043).
 *
 * Widget previews run through the read-only query route, and non-Form widget
 * queries are wrapped with a preview LIMIT. A write statement therefore fails
 * in one of two confusing ways:
 *
 *  - PostgreSQL: `DELETE …` wrapped as `SELECT * FROM (DELETE …) AS __preview`
 *    reports `syntax error at or near "DELETE"` — driver-speak that hides the
 *    real cause.
 *  - Neo4j: `CREATE …` runs in read access mode and reports
 *    `Writing in read access mode not allowed`.
 *
 * Both really mean the same thing: you can't write from a widget query. Detect
 * those shapes and return a single actionable message; otherwise return null so
 * the caller shows the original error.
 */

const WRITE_KEYWORDS = [
  "insert",
  "update",
  "delete",
  "merge",
  "create",
  "drop",
  "alter",
  "truncate",
  "set ",
  "remove ",
];

const READ_ONLY_PHRASES = [
  "writing in read access mode not allowed",
  "write operations are not allowed",
  "read-only transaction",
  "read only transaction",
  "cannot execute",
];

/** True when a wrapped write produced a "syntax error at or near <KEYWORD>". */
function isWrappedWriteSyntaxError(lower: string): boolean {
  const m = /syntax error at or near "([a-z]+)"/.exec(lower);
  if (!m) return false;
  return WRITE_KEYWORDS.some((k) => k.trim() === m[1]);
}

export const PREVIEW_WRITE_NOT_ALLOWED_MESSAGE =
  "Writes aren't allowed from widget queries. Widget previews run read-only — use a Form widget to write to the database.";

/**
 * Returns the friendly write-not-allowed message when the raw error looks like
 * a blocked write attempt, otherwise null.
 */
export function mapPreviewError(rawMessage: string | undefined): string | null {
  if (!rawMessage) return null;
  const lower = rawMessage.toLowerCase();

  if (READ_ONLY_PHRASES.some((p) => lower.includes(p))) {
    return PREVIEW_WRITE_NOT_ALLOWED_MESSAGE;
  }
  if (isWrappedWriteSyntaxError(lower)) {
    return PREVIEW_WRITE_NOT_ALLOWED_MESSAGE;
  }
  return null;
}
