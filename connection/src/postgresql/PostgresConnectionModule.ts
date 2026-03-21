import { ConnectionModule } from '../generalized/ConnectionModule';
import { PostgresAuthenticationModule } from './PostgresAuthenticationModule';
import {
  AuthConfig,
  AdvancedConnectionOptions,
  ConnectionConfig,
  QueryCallback,
  QueryParams,
  QueryStatus,
} from '../generalized/interfaces';
import { PostgresRecordParser } from './PostgresRecordParser';
import { Pool, PoolClient } from 'pg';
import { extractTableSchemaFromFields, errorHasMessage, isTimeoutError, isAuthenticationError } from './utils';
import { determineQueryStatus } from '../generalized/utils';

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
  constructor(config: AuthConfig, advancedOptions?: AdvancedConnectionOptions) {
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
    config: ConnectionConfig
  ): Promise<void> {
    const { query, params = {} } = queryParams;

    if (this.handleEmptyQuery(query, callbacks)) return;

    // Ensure connection is established
    if (!this.authModule.getPool()) {
      const authenticated = await this.authModule.verifyAuthentication().catch((err) => {
        // Only swallow auth errors; re-throw network/pool/DNS failures for visibility
        if (isAuthenticationError(err)) return false;
        throw err;
      });
      if (!authenticated) {
        callbacks.setStatus?.(QueryStatus.ERROR);
        callbacks.onFail?.(new Error('Failed to authenticate with PostgreSQL'));
        return;
      }
    }

    await this._runSqlQuery(query, callbacks, config, params);
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
    params: Record<string, unknown> = {}
  ): Promise<void> {
    // Pool is guaranteed to exist — runQuery ensures authentication before calling this method
    const pool = this.authModule.getPool()!;
    const client = await pool.connect();

    try {
      // Start transaction based on access mode
      const isReadOnly = config.accessMode === 'READ';
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
      const paramValues = paramKeys.length > 0
        ? paramKeys.sort((a, b) => Number(a) - Number(b)).map((k) => params[k])
        : [];

      // Execute query with positional parameters
      const result = await client.query(query, paramValues);

      // Commit transaction
      await client.query('COMMIT');

      const rowCount = result.rowCount || 0;
      const isTruncated = rowCount > config.rowLimit;

      // Extract schema if callback is provided
      if (callbacks.setSchema && result.fields) {
        const schema = extractTableSchemaFromFields(result.fields);
        callbacks.setSchema(schema);
      }

      callbacks.setStatus?.(determineQueryStatus(rowCount, config.rowLimit));

      // Parse results to NeodashRecord format
      const limitedRows = isTruncated ? result.rows.slice(0, config.rowLimit) : result.rows;
      const parsedRecords = config.parseToNeodashRecord
        ? this.parser.bulkParse(limitedRows)
        : limitedRows;

      // Set fields if callback is provided
      if (callbacks.setFields) {
        if (parsedRecords.length > 0 && config.parseToNeodashRecord) {
          const firstRecord = this.parser.bulkParse([result.rows[0]])[0];
          callbacks.setFields(firstRecord.getFields(config.useNodePropsAsFields));
        } else {
          callbacks.setFields([]);
        }
      }

      // Return a flat array of records — same shape as Neo4j's onSuccess.
      // query-executor.ts wraps this as { data: result } for consumers.
      callbacks.onSuccess?.(parsedRecords as T);
    } catch (error: unknown) {
      // Rollback transaction on error
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        // Log only error type — never the full error which may contain connection details
        const code = rollbackError instanceof Error ? rollbackError.message.split(':')[0] : 'unknown';
        console.error('Error during rollback:', code);
      }

      // Determine error type
      if (errorHasMessage(error)) {
        const isTimeout = isTimeoutError(error);
        callbacks.setStatus?.(isTimeout ? QueryStatus.TIMED_OUT : QueryStatus.ERROR);
      } else {
        callbacks.setStatus?.(QueryStatus.ERROR);
      }

      callbacks.onFail?.(error);
    } finally {
      client.release();
    }
  }

  /**
   * Begins a transaction with the specified isolation level.
   * @param client - The database client
   * @param readOnly - Whether the transaction is read-only
   */
  private async _beginTransaction(client: PoolClient, readOnly: boolean): Promise<void> {
    if (readOnly) {
      await client.query('BEGIN TRANSACTION READ ONLY');
    } else {
      await client.query('BEGIN');
    }
  }

  /**
   * Checks if the database connection is active and healthy.
   * @returns true if connection is valid, false otherwise
   */
  async checkConnection(_connectionConfig?: ConnectionConfig): Promise<boolean> {
    try {
      const pool = this.authModule.getPool();
      if (!pool) {
        // Try to authenticate first — only swallow auth errors
        const authenticated = await this.authModule.verifyAuthentication().catch((err) => {
          if (isAuthenticationError(err)) return false;
          throw err;
        });
        if (!authenticated) return false;
      }

      const client = await this.authModule.getPool()!.connect();
      try {
        await client.query('SELECT 1');
        return true;
      } finally {
        client.release();
      }
    } catch (error) {
      // Log only error type — never the full error which may contain connection details
      const code = error instanceof Error ? error.message.split(':')[0] : 'unknown';
      console.error('Connection check failed:', code);
      return false;
    }
  }

  /**
   * Closes the connection pool.
   */
  async close(): Promise<void> {
    await this.authModule.close();
  }
}
