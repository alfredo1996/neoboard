import type { FieldDef, Pool, QueryConfig, QueryResultRow } from "pg";
import { DEFAULT_CONNECTION_CONFIG } from "@neoboard/connector-sdk";

/**
 * PostgreSQL Utility Functions
 */

export { errorHasMessage } from "@neoboard/connector-sdk";

/**
 * Extracts schema information from PostgreSQL field metadata.
 * Similar to Neo4j's extractNodeAndRelPropertiesFromRecords but for relational data.
 *
 * @param fields - PostgreSQL field metadata from query result
 * @returns Array of [tableName, field1, field2, ...] arrays, or empty array
 */
export function extractTableSchemaFromFields(fields: FieldDef[]): string[][] {
  if (!fields || fields.length === 0) return [];
  return [["result", ...fields.map((f) => f.name)]];
}

/**
 * Checks if an error is an authentication error.
 * @param error - The error object
 * @returns true if the error is an authentication issue
 */
export function isAuthenticationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const code =
    "code" in error && typeof (error as { code: unknown }).code === "string"
      ? (error as { code: string }).code
      : "";

  // PostgreSQL authentication error codes. Keep in sync with
  // detectPostgresErrorType (generalized/ConnectorError.ts) — notably
  // 3D000 (invalid_catalog_name) is a CONNECTION error there, not auth:
  // credentials can be valid while the database doesn't exist (#974).
  return (
    code === "28P01" || // invalid_password
    code === "28000" || // invalid_authorization_specification
    code === "28001" // invalid_password (GSSAPI)
  );
}

/**
 * node-postgres emits 'error' on CHECKED-OUT clients directly — the
 * pool-level handler does not cover them. Without a listener, a backend
 * dying mid-checkout (server restart, pg_terminate_backend, container
 * teardown) raises an unhandled 'error' event that can kill the whole
 * process (#999). The in-flight query still rejects through the normal
 * await path; the guard just absorbs the event. Returns a cleanup to call
 * before release so listeners don't accumulate on pooled clients.
 */
export function attachClientErrorGuard(client: {
  on(event: "error", listener: (err: Error) => void): unknown;
  removeListener(event: "error", listener: (err: Error) => void): unknown;
}): () => void {
  const onClientError = () => {};
  client.on("error", onClientError);
  return () => {
    client.removeListener("error", onClientError);
  };
}

/**
 * Runs one hardcoded introspection or health-check statement on a pooled
 * client (#1302). `connectionTimeoutMillis` bounds only acquiring the client;
 * nothing bounded the query itself, so a slow catalog or a backend that
 * stopped answering pinned the client for good. Every such checkout goes
 * through here: guarded (#999), bounded, and destroyed on failure rather than
 * handed back to the pool while it may still be busy with the abandoned query.
 *
 * ponytail: the bound is pg's client-side `query_timeout`, not a pool-level
 * `statement_timeout`. That one travels as a startup parameter, which a default
 * PgBouncer rejects, and a stalled backend never enforces it. Ceiling: a
 * timed-out catalog query keeps running server-side until it next writes to
 * the closed socket. Widget queries keep their SET LOCAL statement_timeout.
 */
export async function runBoundedQuery<
  R extends QueryResultRow = QueryResultRow,
>(
  pool: Pool,
  text: string,
  timeoutMs: number = DEFAULT_CONNECTION_CONFIG.timeout,
): Promise<R[]> {
  const client = await pool.connect();
  const releaseErrorGuard = attachClientErrorGuard(client);
  let failure: Error | undefined;
  try {
    // pg reads query_timeout off the per-query config (lib/client.js), but
    // @types/pg declares it only on ClientConfig.
    const config: QueryConfig & { query_timeout: number } = {
      text,
      query_timeout: timeoutMs,
    };
    return (await client.query<R>(config)).rows;
  } catch (error) {
    failure = error as Error;
    throw error;
  } finally {
    releaseErrorGuard();
    client.release(failure);
  }
}
