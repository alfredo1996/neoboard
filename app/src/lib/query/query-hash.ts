import { createHash } from "crypto";

/**
 * Computes a deterministic 16-char hex result ID from a connection ID, the
 * database the run used, the query string, optional parameters and the row
 * limit the query ran at.
 *
 * Normalization: trim + collapse whitespace, so formatting alone does not
 * change the id. Case is kept (#1964): `:Person` and `:person` are different
 * labels, `'Alice'` and `'alice'` different literals.
 * ponytail: whitespace inside a string literal collapses too; fine for an id
 * that only gates UI state, not for a cache key.
 *
 * The row limit is part of the identity (#1896): the editor preview runs the
 * same query text as the dashboard card at a lower cap, and its 25 rows are
 * not the card's result. So is the database (#1964): the same query on two
 * databases of one connection is two results.
 */
export function computeResultId(
  connectionId: string,
  query: string,
  params?: Record<string, unknown>,
  rowLimit?: number,
  database?: string,
): string {
  const normalizedQuery = query.trim().replace(/\s+/g, " ");
  return createHash("sha256")
    .update(connectionId)
    .update("\x00")
    .update(normalizedQuery)
    .update("\x00")
    .update(JSON.stringify(params ?? null))
    .update("\x00")
    .update(String(rowLimit ?? ""))
    .update("\x00")
    .update(database ?? "")
    .digest("hex")
    .slice(0, 16);
}
