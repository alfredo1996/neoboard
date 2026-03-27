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

  constructor(
    message: string,
    type: ConnectorErrorType = ConnectorErrorType.UNKNOWN,
    originalError?: unknown,
  ) {
    super(message);
    this.name = "ConnectorError";
    this.type = type;
    this.originalError = originalError;
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
 * Wrap a raw database error into a ConnectorError with detected type.
 */
export function wrapError(
  err: unknown,
  dbType: "neo4j" | "postgresql",
): ConnectorError {
  const type =
    dbType === "neo4j"
      ? detectNeo4jErrorType(err)
      : detectPostgresErrorType(err);
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "object" &&
          err !== null &&
          "message" in err &&
          typeof (err as { message?: unknown }).message === "string"
        ? (err as { message: string }).message
        : String(err);
  return new ConnectorError(message, type, err);
}
