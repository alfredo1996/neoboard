/**
 * Map a preview-query error into a clear, user-facing message (#1043).
 *
 * Widget previews run through the read-only query route, so a write statement
 * fails — and each driver says so in its own confusing way. They all mean the
 * same thing: you can't write from a widget query.
 *
 * Which driver message means that is the connector's business: its
 * `classifyError` hook sets `blockedWrite`, the query route passes the flag on
 * as `details.blockedWrite`, and the API client hangs `details` on the Error
 * it throws (#1903). Nothing here reads a message.
 */

export const PREVIEW_WRITE_NOT_ALLOWED_MESSAGE =
  "Writes aren't allowed from widget queries. Widget previews run read-only — use a Form widget to write to the database.";

/**
 * Returns the friendly write-not-allowed message when the connector flagged the
 * error as a blocked write, otherwise null so the caller shows the original.
 */
export function mapPreviewError(error: unknown): string | null {
  const details = (error as { details?: { blockedWrite?: unknown } } | null)
    ?.details;
  return details?.blockedWrite === true
    ? PREVIEW_WRITE_NOT_ALLOWED_MESSAGE
    : null;
}
