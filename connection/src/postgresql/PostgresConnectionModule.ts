import {
  AuthConfig,
  ConnectionConfig,
  ConnectionModule,
  ConnectorError,
  ConnectorErrorType,
  DEFAULT_CONNECTION_CONFIG,
  determineQueryStatus,
  PostgresAdvancedOptions,
  QueryCallback,
  QueryParams,
  QueryStatus,
  wrapError,
} from "@neoboard/connector-sdk";
import {
  attachClientErrorGuard,
  extractTableSchemaFromFields,
  isAuthenticationError,
} from "./utils";
import { PostgresAuthenticationModule } from "./PostgresAuthenticationModule";
import { PostgresRecordParser } from "./PostgresRecordParser";
import { Pool, PoolClient, FieldDef } from "pg";
import { readBoundedCursor, drainBoundedCursor } from "./cursor-read";

/**
 * PostgreSQL Connection Module
 * Handles connection, query execution, and transaction management for PostgreSQL databases.
 */
export class PostgresConnectionModule extends ConnectionModule {
  authModule: PostgresAuthenticationModule;
  private readonly parser: PostgresRecordParser;

  /**
   * Creates a new PostgreSQL connection module.
   * @param config - The authentication configuration
   * @param advancedOptions - Optional advanced pool/timeout settings
   */
  constructor(config: AuthConfig, advancedOptions?: PostgresAdvancedOptions) {
    super();
    this.authModule = new PostgresAuthenticationModule(config, advancedOptions);
    this.parser = new PostgresRecordParser();
  }

  /**
   * Returns the connection pool.
   * @returns The Pool instance or null if not authenticated
   */
  getPool(): Pool | null {
    return this.authModule.getPool();
  }

  /**
   * Executes a SQL query on the PostgreSQL database.
   * Supports success and failure callbacks with status tracking.
   *
   * @param queryParams - Object containing the SQL query and parameters
   * @param callbacks - Object containing onSuccess, onFail callbacks and status setters
   * @param config - Connection configuration object
   */
  async runQuery<T>(
    queryParams: QueryParams,
    callbacks: QueryCallback<T>,
    config: ConnectionConfig,
  ): Promise<void> {
    const { query, params = {} } = queryParams;

    if (this.handleEmptyQuery(query, callbacks)) return;

    // Invariant: every CONNECTOR-side failure (auth, pool.connect, network,
    // the query itself) funnels to onFail and runQuery resolves. The one thing
    // that may reject runQuery is the consumer's own onSuccess throwing — that
    // is delivered below, outside this try, so the connector never mistakes a
    // consumer bug for a database failure: no ROLLBACK of a committed
    // transaction, no ERROR status, no onFail (#1642). query-executor.ts
    // catches the rejection; before #1642 it dropped runQuery's promise, and
    // an escaped error there hung the request and pinned a scheduler slot.
    let payload: T | undefined;
    try {
      // Ensure connection is established
      if (!this.authModule.getPool()) {
        const authenticated = await this.authModule
          .verifyAuthentication()
          .catch((err) => {
            // Only swallow auth errors; surface network/pool/DNS failures via
            // the outer catch → onFail (not a rethrow that escapes runQuery).
            if (isAuthenticationError(err)) return false;
            throw err;
          });
        if (!authenticated) {
          // A ConnectorError, not a plain Error: the query route only
          // classifies connector-raised failures, and "authentication failed"
          // is what its classifier reads as auth_failed → 502 (#1678). A
          // plain Error here went out as a 500 with no hint.
          callbacks.setStatus?.(QueryStatus.ERROR);
          callbacks.onFail?.(
            new ConnectorError(
              "PostgreSQL authentication failed: the server rejected the username or password",
              ConnectorErrorType.AUTHENTICATION,
            ),
          );
          return;
        }
      }

      payload = await this._runSqlQuery<T>(query, callbacks, config, params);
    } catch (error: unknown) {
      const wrapped = wrapError(error, "postgresql");
      callbacks.setStatus?.(
        wrapped.type === ConnectorErrorType.TIMEOUT
          ? QueryStatus.TIMED_OUT
          : QueryStatus.ERROR,
      );
      callbacks.onFail?.(wrapped);
      return;
    }
    // Outside the try on purpose — see the invariant above.
    if (payload !== undefined) callbacks.onSuccess?.(payload);
  }

  /**
   * Internal method to execute SQL query with transaction support.
   * @param query - The SQL query string
   * @param callbacks - Callback handlers
   * @param config - Connection configuration
   * @param params - Query parameters
   */
  private async _runSqlQuery<T>(
    query: string,
    callbacks: QueryCallback<T>,
    config: ConnectionConfig,
    params: Record<string, unknown> = {},
  ): Promise<T | undefined> {
    // Pool is guaranteed to exist — runQuery ensures authentication before calling this method
    const pool = this.authModule.getPool()!;
    // client is acquired INSIDE the try so a failed pool.connect() (DB down,
    // pool saturated) routes to onFail instead of rejecting _runSqlQuery. (#CRITICAL)
    let client: PoolClient | undefined;
    let releaseErrorGuard: (() => void) | undefined;

    try {
      client = await pool.connect();
      releaseErrorGuard = attachClientErrorGuard(client);

      // Start transaction based on access mode. Fail CLOSED: only an explicit
      // "WRITE" gets a read-write transaction; any other value (undefined, or a
      // mis-cased "read" that has reached this layer before, #1044) stays READ
      // ONLY so a non-Form query can never write. Mirrors Neo4j's
      // executeRead-unless-WRITE contract. (#HIGH)
      const isReadOnly = config.accessMode !== "WRITE";
      await this._beginTransaction(client, isReadOnly);

      // Set statement timeout — always. A falsy config.timeout falls back to
      // the documented default; it used to skip SET LOCAL and run unbounded
      // (#1302). SET does not support parameterized queries ($1) in
      // PostgreSQL, so we use SET LOCAL with a validated integer. SET LOCAL
      // scopes the change to the current transaction — it auto-reverts on
      // COMMIT/ROLLBACK.
      const timeoutMs = Math.floor(
        config.timeout || DEFAULT_CONNECTION_CONFIG.timeout,
      );
      await client.query(`SET LOCAL statement_timeout = '${timeoutMs}'`);

      // Handle parameter substitution
      // PostgreSQL (pg library) uses $1, $2, etc. for positional parameters.
      // Params arrive as { "0": val0, "1": val1, ... } from rewriteParamsForPostgres.
      // Sort keys numerically to guarantee correct $1, $2, ... ordering.
      const paramKeys = Object.keys(params);
      const paramValues =
        paramKeys.length > 0
          ? paramKeys
              .sort((a, b) => Number(a) - Number(b))
              .map((k) => params[k])
          : [];

      // Both paths stream through a server-side cursor so a huge result set
      // never buffers in memory; each pulls at most rowLimit + 1 rows for the
      // MAX_ROWS+1 truncation probe. They differ in how they STOP:
      //   READ  stops as soon as truncation is known, releasing the portal.
      //   WRITE drains to exhaustion, because PostgreSQL applies an
      //         UPDATE ... RETURNING incrementally — rows never pulled are
      //         never modified — and then reports the driver's affected-row
      //         count so an INSERT without RETURNING still reads as COMPLETE
      //         rather than NO_DATA (#1298, #1326).
      let fetchedRows: Record<string, unknown>[];
      let fields: FieldDef[] | undefined;
      let affectedRowCount: number | undefined;

      if (isReadOnly) {
        const batch = await readBoundedCursor(
          client,
          query,
          paramValues,
          config.rowLimit + 1,
        );
        fetchedRows = batch.rows;
        fields = batch.fields;
      } else {
        // Writes stream too, but they must be DRAINED rather than stopped
        // early: PostgreSQL applies an UPDATE ... RETURNING incrementally, so
        // rows never pulled are never modified. readBoundedCursor stops after
        // one bounded read and closes the portal — correct for a SELECT,
        // silently partially-applied for a write (#1298, #1326).
        const batch = await drainBoundedCursor(
          client,
          query,
          paramValues,
          config.rowLimit + 1,
        );
        fetchedRows = batch.rows;
        fields = batch.fields;
        affectedRowCount = batch.affectedRowCount;
      }

      // Commit transaction
      await client.query("COMMIT");

      const isTruncated = fetchedRows.length > config.rowLimit;
      const limitedRows = isTruncated
        ? fetchedRows.slice(0, config.rowLimit)
        : fetchedRows;
      // For reads, the streamed count is capped at rowLimit + 1, which yields
      // the same status as the true count (> rowLimit ⇒ truncated). For writes,
      // use the driver's affected-row count.
      const rowCount =
        affectedRowCount ??
        (isTruncated ? config.rowLimit + 1 : fetchedRows.length);

      // Extract schema if callback is provided
      if (callbacks.setSchema && fields) {
        const schema = extractTableSchemaFromFields(fields);
        callbacks.setSchema(schema);
      }

      callbacks.setStatus?.(determineQueryStatus(rowCount, config.rowLimit));

      // Parse results to NeodashRecord format
      const parsedRecords = config.parseToNeodashRecord
        ? this.parser.bulkParse(limitedRows, fields)
        : limitedRows;

      // Set fields if callback is provided
      if (callbacks.setFields) {
        if (limitedRows.length > 0 && config.parseToNeodashRecord) {
          const firstRecord = this.parser.bulkParse(
            [limitedRows[0]],
            fields,
          )[0];
          callbacks.setFields(
            firstRecord.getFields(config.useNodePropsAsFields),
          );
        } else {
          callbacks.setFields([]);
        }
      }

      // Return a flat array of records — same shape as Neo4j's onSuccess.
      // query-executor.ts wraps this as { data: result } for consumers.
      // Handed back rather than delivered here: onSuccess runs in runQuery,
      // outside this try, so a throwing consumer handler cannot reach the
      // ROLLBACK below (#1642).
      return parsedRecords as T;
    } catch (error: unknown) {
      // Rollback transaction on error — only if a client/transaction exists
      // (a failed pool.connect() lands here with no client to roll back).
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          // Log only the SQLSTATE code / error name — NEVER the message, which
          // can carry connection details. (message.split(":")[0] leaked the
          // whole message when it had no colon — CodeRabbit.)
          const code =
            (rollbackError as { code?: string })?.code ??
            (rollbackError instanceof Error ? rollbackError.name : "unknown");
          console.error("Error during rollback:", code);
        }
      }

      // Wrap raw error into normalized ConnectorError
      const wrapped = wrapError(error, "postgresql");
      callbacks.setStatus?.(
        wrapped.type === ConnectorErrorType.TIMEOUT
          ? QueryStatus.TIMED_OUT
          : QueryStatus.ERROR,
      );
      callbacks.onFail?.(wrapped);
      return undefined;
    } finally {
      releaseErrorGuard?.();
      client?.release();
    }
  }

  /**
   * Begins a transaction with the specified isolation level.
   * @param client - The database client
   * @param readOnly - Whether the transaction is read-only
   */
  private async _beginTransaction(
    client: PoolClient,
    readOnly: boolean,
  ): Promise<void> {
    if (readOnly) {
      await client.query("BEGIN TRANSACTION READ ONLY");
    } else {
      await client.query("BEGIN");
    }
  }

  /**
   * Lists available databases on the PostgreSQL server.
   * Excludes template databases (template0, template1).
   * Returns an empty array if the query fails.
   */
  async listDatabases(): Promise<string[]> {
    try {
      if (!this.authModule.getPool()) {
        const authenticated = await this.authModule
          .verifyAuthentication()
          .catch(() => false);
        if (!authenticated) return [];
      }
      const rows = await this.authModule.introspect<{ datname: string }>(
        "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname",
      );
      return rows.map((row) => row.datname);
    } catch {
      return [];
    }
  }

  /**
   * Lists available schemas in the current database.
   * Excludes internal pg_ schemas.
   * Returns an empty array if the query fails.
   */
  async listSchemas(): Promise<string[]> {
    try {
      if (!this.authModule.getPool()) {
        const authenticated = await this.authModule
          .verifyAuthentication()
          .catch(() => false);
        if (!authenticated) return [];
      }
      const rows = await this.authModule.introspect<{ schema_name: string }>(
        "SELECT schema_name FROM information_schema.schemata WHERE schema_name <> 'information_schema' AND schema_name NOT LIKE 'pg\\_%' ORDER BY schema_name",
      );
      return rows.map((row) => row.schema_name);
    } catch {
      return [];
    }
  }

  /**
   * Checks if the database connection is active and healthy.
   *
   * Throws a wrapped `ConnectorError` on any failure so the API route can
   * classify the cause (auth_failed / network / bad_uri / unknown) — see
   * `app/src/lib/connector/connection-error-classifier.ts`. Returning a
   * bare `false` would leave the UI with the useless "Connection check
   * returned false" message (#900). This matches the Neo4j contract.
   *
   * @returns Promise<true> on success; throws ConnectorError on failure.
   */
  async checkConnection(
    _connectionConfig?: ConnectionConfig,
  ): Promise<boolean> {
    try {
      const pool = this.authModule.getPool();
      if (!pool) {
        await this.authModule.verifyAuthentication();
      }

      await this.authModule.introspect("SELECT 1");
      return true;
    } catch (error) {
      const wrapped = wrapError(error, "postgresql");
      // Log only error type — never the full error which may contain connection details
      console.warn("Connection check failed:", wrapped.type);
      throw wrapped;
    }
  }

  /**
   * Closes the connection pool.
   */
  async close(): Promise<void> {
    await this.authModule.close();
  }
}
