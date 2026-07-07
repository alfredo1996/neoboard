import { ConnectionModule } from "@neoboard/connector-sdk";
import { attachClientErrorGuard } from "./utils";
import { PostgresAuthenticationModule } from "./PostgresAuthenticationModule";
import {
  AuthConfig,
  PostgresAdvancedOptions,
  ConnectionConfig,
  QueryCallback,
  QueryParams,
  QueryStatus,
} from "@neoboard/connector-sdk";
import { PostgresRecordParser } from "./PostgresRecordParser";
import { Pool, PoolClient, FieldDef } from "pg";
import { readBoundedCursor } from "./cursor-read";
import { extractTableSchemaFromFields, isAuthenticationError } from "./utils";
import { determineQueryStatus } from "@neoboard/connector-sdk";
import { wrapError, ConnectorErrorType } from "@neoboard/connector-sdk";

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

    // Invariant: runQuery must NEVER reject. The caller wraps this in a promise
    // that settles only via onSuccess/onFail, so any thrown/rejected error here
    // would leave that promise pending forever — hanging the request and pinning
    // a scheduler slot. Funnel every failure (auth, pool.connect, network) to
    // onFail. Neo4j already upholds this contract. (#CRITICAL)
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
          callbacks.setStatus?.(QueryStatus.ERROR);
          callbacks.onFail?.(
            new Error("Failed to authenticate with PostgreSQL"),
          );
          return;
        }
      }

      await this._runSqlQuery(query, callbacks, config, params);
    } catch (error: unknown) {
      const wrapped = wrapError(error, "postgresql");
      callbacks.setStatus?.(
        wrapped.type === ConnectorErrorType.TIMEOUT
          ? QueryStatus.TIMED_OUT
          : QueryStatus.ERROR,
      );
      callbacks.onFail?.(wrapped);
    }
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
  ): Promise<void> {
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

      // Set statement timeout if specified.
      // SET does not support parameterized queries ($1) in PostgreSQL,
      // so we use SET LOCAL with a validated integer. SET LOCAL scopes the
      // change to the current transaction — it auto-reverts on COMMIT/ROLLBACK.
      if (config.timeout) {
        const timeoutMs = Math.floor(config.timeout);
        await client.query(`SET LOCAL statement_timeout = '${timeoutMs}'`);
      }

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

      // Fetch rows. READ queries stream through a server-side cursor so a
      // huge result set never buffers in memory — we pull at most rowLimit + 1
      // rows (the MAX_ROWS+1 truncation probe). WRITE queries (Form widgets)
      // keep the direct path: their result sets are small and we need the
      // driver's affected-row count so an INSERT without RETURNING still
      // reports COMPLETE rather than NO_DATA.
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
        const result = await client.query(query, paramValues);
        fetchedRows = result.rows;
        fields = result.fields;
        affectedRowCount = result.rowCount ?? undefined;
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
        ? this.parser.bulkParse(limitedRows)
        : limitedRows;

      // Set fields if callback is provided
      if (callbacks.setFields) {
        if (limitedRows.length > 0 && config.parseToNeodashRecord) {
          const firstRecord = this.parser.bulkParse([limitedRows[0]])[0];
          callbacks.setFields(
            firstRecord.getFields(config.useNodePropsAsFields),
          );
        } else {
          callbacks.setFields([]);
        }
      }

      // Return a flat array of records — same shape as Neo4j's onSuccess.
      // query-executor.ts wraps this as { data: result } for consumers.
      callbacks.onSuccess?.(parsedRecords as T);
    } catch (error: unknown) {
      // Rollback transaction on error — only if a client/transaction exists
      // (a failed pool.connect() lands here with no client to roll back).
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          // Log only error type — never the full error which may contain connection details
          const code =
            rollbackError instanceof Error
              ? rollbackError.message.split(":")[0]
              : "unknown";
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
      const pool = this.authModule.getPool()!;
      const client = await pool.connect();
      const releaseErrorGuard = attachClientErrorGuard(client);
      try {
        const result = await client.query(
          "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname",
        );
        return result.rows.map((row: { datname: string }) => row.datname);
      } finally {
        releaseErrorGuard();
        client.release();
      }
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
      const pool = this.authModule.getPool()!;
      const client = await pool.connect();
      const releaseErrorGuard = attachClientErrorGuard(client);
      try {
        const result = await client.query(
          "SELECT schema_name FROM information_schema.schemata WHERE schema_name <> 'information_schema' AND schema_name NOT LIKE 'pg\\_%' ORDER BY schema_name",
        );
        return result.rows.map(
          (row: { schema_name: string }) => row.schema_name,
        );
      } finally {
        releaseErrorGuard();
        client.release();
      }
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

      const client = await this.authModule.getPool()!.connect();
      const releaseErrorGuard = attachClientErrorGuard(client);
      try {
        await client.query("SELECT 1");
        return true;
      } finally {
        releaseErrorGuard();
        client.release();
      }
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
