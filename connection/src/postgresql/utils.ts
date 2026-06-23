import type { FieldDef } from "pg";

/**
 * PostgreSQL Utility Functions
 */

export { errorHasMessage } from "../generalized/utils";

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
 * Detects if a PostgreSQL error is a timeout error.
 * @param error - The error object
 * @returns true if the error is a timeout
 */
export function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const message =
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
      ? (error as { message: string }).message
      : "";
  const code =
    "code" in error && typeof (error as { code: unknown }).code === "string"
      ? (error as { code: string }).code
      : "";

  // PostgreSQL timeout error codes and messages
  return (
    code === "57014" || // query_canceled
    code === "57P01" || // admin_shutdown
    message.includes("timeout") ||
    message.includes("canceling statement due to statement timeout") ||
    message.includes("terminating connection due to administrator command")
  );
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
