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
