/**
 * Minimal type declarations for `pg-cursor` (v2.x), which ships no types and
 * has no `@types/pg-cursor` on DefinitelyTyped. Only the surface we use is
 * declared: constructing a cursor, a single bounded `read`, and `close`.
 *
 * `read(rowCount, cb)` invokes the callback with the rows AND the underlying
 * pg `Result` (so `result.fields` is available for schema extraction).
 */
declare module "pg-cursor" {
  import type {
    Connection,
    Submittable,
    QueryResult,
    QueryResultRow,
  } from "pg";

  export default class Cursor<
    R extends QueryResultRow = QueryResultRow,
  > implements Submittable {
    constructor(
      text: string,
      values?: unknown[],
      config?: { rowMode?: string },
    );

    /** Wires the cursor into the pg connection. Called by `client.query(cursor)`. */
    submit(connection: Connection): void;

    /** Reads up to `rowCount` rows in a single bounded batch. */
    read(
      rowCount: number,
      callback: (err: Error | null, rows: R[], result: QueryResult<R>) => void,
    ): void;

    /** Closes the cursor and releases its server-side portal. */
    close(callback?: (err?: Error) => void): void;
  }
}
