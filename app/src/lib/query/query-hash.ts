import { createHash } from "crypto";

/**
 * Computes a deterministic 16-char hex result ID from a connection ID,
 * query string, optional parameters and the row limit the query ran at.
 *
 * Normalization: trim + collapse whitespace + lowercase so minor formatting
 * differences don't invalidate the hash.
 *
 * The row limit is part of the identity (#1896): the editor preview runs the
 * same query text as the dashboard card at a lower cap, and its 25 rows are
 * not the card's result.
 */
export function computeResultId(
  connectionId: string,
  query: string,
  params?: Record<string, unknown>,
  rowLimit?: number,
): string {
  const normalizedQuery = query.trim().replace(/\s+/g, " ").toLowerCase();
  return createHash("sha256")
    .update(connectionId)
    .update("\x00")
    .update(normalizedQuery)
    .update("\x00")
    .update(JSON.stringify(params ?? null))
    .update("\x00")
    .update(String(rowLimit ?? ""))
    .digest("hex")
    .slice(0, 16);
}
