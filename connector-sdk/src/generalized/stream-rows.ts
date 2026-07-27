/**
 * Result of draining an async row source up to a configured limit.
 */
export interface CollectedRows<T> {
  /** At most `rowLimit` rows, in source order. */
  rows: T[];
  /** True when the source held more than `rowLimit` rows. */
  truncated: boolean;
}

/**
 * Pulls rows from an async iterable, stopping as soon as one more row than
 * `rowLimit` has been seen.
 *
 * This is the MAX_ROWS+1 streaming pattern: instead of buffering the entire
 * result set in memory and slicing, we consume the cursor/stream incrementally
 * and abandon it once we know the result is truncated. At most `rowLimit + 1`
 * rows are ever pulled from the source, and `rowLimit` are retained — so peak
 * memory is bounded regardless of how large the underlying result is.
 *
 * Breaking out of the `for await` loop invokes the iterator's `return()`,
 * which is how pg-cursor and the Neo4j `Result` release their server-side
 * portal/stream when we stop early.
 *
 * @param source     - Async iterable of rows (pg-cursor batch, Neo4j Result, …)
 * @param rowLimit   - Maximum rows to retain; must be a non-negative integer
 * @returns the retained rows plus whether the source was truncated
 */
export async function collectUpToLimit<T>(
  source: AsyncIterable<T>,
  rowLimit: number,
): Promise<CollectedRows<T>> {
  const rows: T[] = [];
  let truncated = false;

  for await (const row of source) {
    if (rows.length >= rowLimit) {
      // One row beyond the limit exists — flag truncation and stop pulling.
      truncated = true;
      break;
    }
    rows.push(row);
  }

  return { rows, truncated };
}

/**
 * Drains an async row source to completion, retaining at most `rowLimit` rows.
 *
 * This is the WRITE-path counterpart to {@link collectUpToLimit}, and the
 * difference is not an optimisation — it is correctness.
 *
 * `collectUpToLimit` stops pulling once it knows the result is truncated, which
 * invokes the iterator's `return()` and releases the server-side portal. On a
 * read that is exactly right. On a write it is a data-integrity bug: a database
 * executes `UPDATE … RETURNING` incrementally, so rows that are never pulled
 * are never modified. Stopping early would silently turn "update 1,000,000
 * rows" into "update 26 rows" and still report success.
 *
 * So this pulls every row — every side effect runs — and simply stops *keeping*
 * them past the limit. Peak memory becomes the driver's fetch-size watermark
 * plus `rowLimit`, rather than the whole result set (#1298).
 *
 * @param source   - Async iterable of rows (Neo4j Result, pg-cursor batch, …)
 * @param rowLimit - Maximum rows to retain; the source is drained regardless
 * @returns the retained rows plus whether the source held more than `rowLimit`
 */
export async function drainRetainingUpTo<T>(
  source: AsyncIterable<T>,
  rowLimit: number,
): Promise<CollectedRows<T>> {
  const rows: T[] = [];
  let total = 0;

  for await (const row of source) {
    total += 1;
    if (rows.length < rowLimit) {
      rows.push(row);
    }
  }

  return { rows, truncated: total > rowLimit };
}
