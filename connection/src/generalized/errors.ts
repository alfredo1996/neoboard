/**
 * Standard error types for connector plugins.
 *
 * All connectors should throw these (or subclasses of these) so the UI
 * can show appropriate error messages and retry behavior.
 */

/**
 * Connection failed — wrong credentials, host unreachable, SSL error, etc.
 * The UI should prompt the user to check their connection settings.
 */
export class ConnectionError extends Error {
  readonly code: string;

  constructor(message: string, code = "CONNECTION_FAILED") {
    super(message);
    this.name = "ConnectionError";
    this.code = code;
  }
}

/**
 * Query execution failed — syntax error, timeout, permission denied, etc.
 * The UI should show the error in the widget card.
 */
export class QueryError extends Error {
  readonly code: string;
  /** The query that failed (for debugging, never log credentials). */
  readonly query?: string;

  constructor(message: string, code = "QUERY_FAILED", query?: string) {
    super(message);
    this.name = "QueryError";
    this.code = code;
    this.query = query;
  }
}

/**
 * Schema fetch failed — the database is reachable but schema
 * introspection failed (e.g., permission denied on system tables).
 */
export class SchemaError extends Error {
  readonly code: string;

  constructor(message: string, code = "SCHEMA_FAILED") {
    super(message);
    this.name = "SchemaError";
    this.code = code;
  }
}

/**
 * Query timed out — the query exceeded the configured timeout.
 * Distinct from QueryError so the UI can show a retry option.
 */
export class QueryTimeoutError extends QueryError {
  constructor(message = "Query timed out", query?: string) {
    super(message, "QUERY_TIMEOUT", query);
    this.name = "QueryTimeoutError";
  }
}
