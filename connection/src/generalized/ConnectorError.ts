/**
 * Standardized error types across all database connectors.
 * Consumers catch ConnectorError instead of database-specific exceptions.
 */
export enum ConnectorErrorType {
  TIMEOUT = "TIMEOUT",
  AUTHENTICATION = "AUTHENTICATION",
  CONNECTION = "CONNECTION",
  READ_ONLY_VIOLATION = "READ_ONLY_VIOLATION",
  QUERY = "QUERY",
  UNKNOWN = "UNKNOWN",
}

export class ConnectorError extends Error {
  public readonly type: ConnectorErrorType;
  public readonly originalError?: unknown;
  /** Raw error detail — for server-side logging only, NEVER expose to API consumers. */
  public readonly detail?: string;

  constructor(
    message: string,
    type: ConnectorErrorType = ConnectorErrorType.UNKNOWN,
    originalError?: unknown,
    detail?: string,
  ) {
    super(message);
    this.name = "ConnectorError";
    this.type = type;
    this.originalError = originalError;
    this.detail = detail;
  }
}

/**
 * Detect the error type from a Neo4j error.
 */
export function detectNeo4jErrorType(err: unknown): ConnectorErrorType {
  if (!err || typeof err !== "object") return ConnectorErrorType.UNKNOWN;
  const e = err as { code?: string; message?: string };
  const msg = e.message ?? "";
  const code = e.code ?? "";

  if (code === "ServiceUnavailable" || msg.includes("Failed to connect")) {
    return ConnectorErrorType.CONNECTION;
  }
  if (
    code === "Neo.ClientError.Security.Unauthorized" ||
    msg.includes("authentication")
  ) {
    return ConnectorErrorType.AUTHENTICATION;
  }
  if (
    msg.startsWith("The transaction has been terminated") ||
    msg.includes("transaction timeout") ||
    msg.includes("has been terminated. Retry")
  ) {
    return ConnectorErrorType.TIMEOUT;
  }
  return ConnectorErrorType.QUERY;
}

/**
 * Detect the error type from a PostgreSQL error.
 */
export function detectPostgresErrorType(err: unknown): ConnectorErrorType {
  if (!err || typeof err !== "object") return ConnectorErrorType.UNKNOWN;
  const e = err as { code?: string; message?: string };
  const code = e.code ?? "";
  const msg = (e.message ?? "").toLowerCase();

  // Timeout errors
  if (
    code === "57014" ||
    code === "57P01" ||
    msg.includes("timeout") ||
    msg.includes("canceling statement")
  ) {
    return ConnectorErrorType.TIMEOUT;
  }
  // Authentication errors
  if (["28P01", "28000", "28001"].includes(code)) {
    return ConnectorErrorType.AUTHENTICATION;
  }
  // 3D000 = invalid_catalog_name (missing database) — connection issue, not auth
  if (code === "3D000") {
    return ConnectorErrorType.CONNECTION;
  }
  // Connection errors
  if (
    code === "08001" ||
    code === "08003" ||
    code === "08006" ||
    msg.includes("connect")
  ) {
    return ConnectorErrorType.CONNECTION;
  }
  // Read-only violation
  if (code === "25006" || msg.includes("read-only")) {
    return ConnectorErrorType.READ_ONLY_VIOLATION;
  }
  return ConnectorErrorType.QUERY;
}

/**
 * User-safe messages per error type. These are shown to API consumers
 * and must never contain sensitive details (hostnames, usernames, ports).
 */
const SAFE_MESSAGES: Record<ConnectorErrorType, string> = {
  [ConnectorErrorType.TIMEOUT]: "Query timed out",
  [ConnectorErrorType.AUTHENTICATION]: "Authentication failed",
  [ConnectorErrorType.CONNECTION]: "Connection failed",
  [ConnectorErrorType.READ_ONLY_VIOLATION]:
    "Write operation not permitted in read-only mode",
  [ConnectorErrorType.QUERY]: "Query execution failed",
  [ConnectorErrorType.UNKNOWN]: "An unexpected error occurred",
};

/**
 * Wrap a raw database error into a ConnectorError with detected type.
 *
 * The returned error has a safe, generic `message` (never leaks hostnames,
 * usernames, or ports) and a `detail` field with the raw message for
 * server-side logging only.
 */
export function wrapError(
  err: unknown,
  dbType: "neo4j" | "postgresql",
): ConnectorError {
  const type =
    dbType === "neo4j"
      ? detectNeo4jErrorType(err)
      : detectPostgresErrorType(err);

  let rawDetail: string;
  if (err instanceof Error) {
    rawDetail = err.message;
  } else if (
    typeof err === "object" &&
    err !== null &&
    "message" in err &&
    typeof (err as { message?: unknown }).message === "string"
  ) {
    rawDetail = (err as { message: string }).message;
  } else {
    rawDetail = String(err);
  }

  return new ConnectorError(SAFE_MESSAGES[type], type, err, rawDetail);
}
