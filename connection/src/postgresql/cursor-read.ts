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

/** A drained cursor: retained rows, field descriptors, and the true row count. */
export interface DrainedCursor extends CursorBatch {
  /**
   * Rows the statement actually produced or affected — not the retained
   * count. Feeds the COMPLETE / NO_DATA decision for writes that return
   * nothing, e.g. an INSERT without RETURNING.
   */
  affectedRowCount: number | undefined;
}

/** Rows pulled per round-trip while draining. Bounds memory, not correctness. */
const DRAIN_BATCH_SIZE = 500;

/**
 * Executes `query` through a server-side cursor and reads it **to exhaustion**,
 * retaining at most `maxRows` rows.
 *
 * This is the WRITE-path counterpart to `readBoundedCursor`, and the difference
 * is correctness rather than performance (#1298, #1326).
 *
 * PostgreSQL executes a portal incrementally. `readBoundedCursor` does one
 * bounded read and then closes the cursor, which is exactly right for a SELECT
 * — but on an `UPDATE … RETURNING` the rows never pulled are never modified,
 * and closing the portal abandons them. Reusing it for writes would silently
 * turn "update 1,000,000 rows" into "update 26" and still report success.
 *
 * So this keeps reading until a batch comes back empty — every row is produced,
 * every side effect runs — while retaining only `maxRows`. Peak memory becomes
 * the batch size plus `maxRows` instead of the whole result set.
 *
 * The user's query text is passed unmodified; parameters stay positional.
 */
export async function drainBoundedCursor(
  client: PoolClient,
  query: string,
  values: unknown[],
  maxRows: number,
): Promise<DrainedCursor> {
  const cursor = client.query(new Cursor(query, values));
  const rows: Record<string, unknown>[] = [];
  let fields: FieldDef[] = [];
  let affectedRowCount: number | undefined;
  let total = 0;

  try {
    for (;;) {
      const batch = await new Promise<{
        rows: Record<string, unknown>[];
        fields: FieldDef[];
        rowCount: number | undefined;
      }>((resolve, reject) => {
        cursor.read(DRAIN_BATCH_SIZE, (err, batchRows, result) => {
          if (err) {
            reject(err);
            return;
          }
          resolve({
            rows: batchRows as Record<string, unknown>[],
            fields: result?.fields ?? [],
            rowCount: result?.rowCount ?? undefined,
          });
        });
      });

      if (batch.fields.length > 0 && fields.length === 0) {
        fields = batch.fields;
      }
      // A non-returning statement (INSERT without RETURNING) yields no rows,
      // so its affected count only ever arrives on the completing batch.
      if (batch.rowCount !== undefined && batch.rowCount !== null) {
        affectedRowCount = batch.rowCount;
      }

      if (batch.rows.length === 0) break;

      total += batch.rows.length;
      for (const row of batch.rows) {
        if (rows.length < maxRows) rows.push(row);
      }
    }
  } finally {
    await closeCursorSafely(cursor);
  }

  return {
    rows,
    fields,
    // Only meaningful for statements that RETURN nothing. A returning
    // statement's completing batch reports rowCount 0, which would otherwise
    // overwrite the real count and make the caller report NO_DATA for an
    // UPDATE that changed a thousand rows. When rows were produced, let the
    // caller derive the count from them.
    affectedRowCount: total > 0 ? undefined : affectedRowCount,
  };
}
