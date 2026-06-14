import Cursor from "pg-cursor";
import type { FieldDef, PoolClient } from "pg";

/**
 * One bounded batch read from a server-side cursor: the rows plus their
 * field descriptors (column name + dataTypeID), used for schema extraction.
 */
export interface CursorBatch {
  rows: Record<string, unknown>[];
  fields: FieldDef[];
}

/**
 * Executes `query` through a server-side cursor and reads at most `maxRows`
 * rows in a single batch.
 *
 * Unlike `client.query(text, values)` — which materialises the entire result
 * set in memory before the caller can slice it — the cursor's portal fetches
 * only `maxRows` rows from the server. Pairing this with `maxRows = rowLimit + 1`
 * implements the MAX_ROWS+1 truncation pattern with bounded memory: a query
 * that would return millions of rows never buffers more than `rowLimit + 1`.
 *
 * The user's query text is passed unmodified — no wrapping, no injected LIMIT.
 * Parameters remain positional ($1, $2, …) via the cursor's `values`.
 *
 * The cursor is always closed (releasing its portal) even if the read fails.
 */
export async function readBoundedCursor(
  client: PoolClient,
  query: string,
  values: unknown[],
  maxRows: number,
): Promise<CursorBatch> {
  const cursor = client.query(new Cursor(query, values));
  try {
    return await new Promise<CursorBatch>((resolve, reject) => {
      cursor.read(maxRows, (err, rows, result) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({
          rows: rows as Record<string, unknown>[],
          fields: result.fields,
        });
      });
    });
  } finally {
    await closeCursorSafely(cursor);
  }
}

/**
 * Closes a cursor without ever hanging. On a healthy connection `close()`'s
 * callback fires as soon as the server sends `readyForQuery` (sub-millisecond),
 * so this resolves immediately. But if the backend was terminated mid-query
 * (CI teardown races, network drops) the cursor is left in an error state and
 * `readyForQuery` never arrives — so we cap the wait. The dead client is
 * discarded by the pool regardless; the unref'd timer keeps this from holding
 * the event loop open.
 */
function closeCursorSafely(cursor: Cursor): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, 2000);
    if (typeof timer.unref === "function") timer.unref();
    try {
      cursor.close(() => done());
    } catch {
      done();
    }
  });
}
