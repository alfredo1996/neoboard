import { Client } from "pg";
import type { Pool, PoolClient, QueryConfig, QueryResultRow } from "pg";
import { DEFAULT_CONNECTION_CONFIG } from "@neoboard/connector-sdk";
import { AUTHENTICATION_SQLSTATES } from "./classify-error";

/**
 * PostgreSQL Utility Functions
 */

export { errorHasMessage } from "@neoboard/connector-sdk";

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

  // 3D000 (invalid_catalog_name) is deliberately not among them: credentials
  // can be valid while the database does not exist (#974).
  return AUTHENTICATION_SQLSTATES.includes(code);
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

/**
 * Cancels the statement running on `client`'s backend when `signal` aborts
 * (#2444): `pg_cancel_backend(pid)` sent over a short-lived client of its own.
 * Not the pool: its default size equals the scheduler's cap, so it may have no
 * free client at the moment the cancel is needed. The cancelled statement
 * rejects on its own connection (57014) and the query settles there. Returns
 * the cleanup to call once the query is done. The cancel only lands while the
 * backend still carries `tag` (set LOCAL in the query's transaction), so one
 * that arrives late cannot hit whatever query reuses the client next.
 *
 * ponytail: a cancel that lands between two statements of the transaction is
 * lost; the caller checks `signal.aborted` before the statement that matters.
 */
export function cancelBackendOnAbort(
  pool: Pool,
  client: PoolClient,
  signal: AbortSignal | undefined,
  tag: string,
): () => void {
  const pid = (client as unknown as { processID?: number }).processID;
  if (!signal || typeof pid !== "number") return () => {};
  const onAbort = () => {
    const canceller = new Client(pool.options);
    canceller.on("error", () => {});
    canceller
      .connect()
      .then(() =>
        canceller.query(
          "SELECT pg_cancel_backend(pid) FROM pg_stat_activity WHERE pid = $1 AND application_name = $2",
          [pid, tag],
        ),
      )
      .catch(() => {})
      .finally(() => canceller.end().catch(() => {}));
  };
  if (signal.aborted) {
    onAbort();
    return () => {};
  }
  signal.addEventListener("abort", onAbort, { once: true });
  return () => signal.removeEventListener("abort", onAbort);
}
