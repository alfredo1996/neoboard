import { ConnectionModule } from '../generalized/ConnectionModule';
import { PostgresAuthenticationModule } from './PostgresAuthenticationModule';
import {
  AuthConfig,
  ConnectionConfig,
  QueryCallback,
  QueryParams,
  QueryStatus,
} from '../generalized/interfaces';
import { PostgresRecordParser } from './PostgresRecordParser';
import { Pool, PoolClient } from 'pg';
import { extractTableSchemaFromFields, errorHasMessage, isTimeoutError } from './utils';

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
   */
  constructor(config: AuthConfig) {
    super();
    this.authModule = new PostgresAuthenticationModule(config);
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

    // Check for empty query
    if (callbacks.setStatus) {
      if (!query || query.trim() === '') {
        callbacks.setStatus(QueryStatus.NO_QUERY);
        return;
      }
      callbacks.setStatus(QueryStatus.RUNNING);
    }

    // Ensure connection is established
    if (!this.authModule.getPool()) {
      const authenticated = await this.authModule.authenticate();
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
    params: Record<string, any> = {}
  ): Promise<void> {
    const pool = this.authModule.getPool();
    if (!pool) {
      callbacks.setStatus?.(QueryStatus.ERROR);
      callbacks.onFail?.(new Error('Database connection pool not available'));
      return;
    }

    const client = await pool.connect();

    try {
      // Start transaction based on access mode
      const isReadOnly = config.accessMode === 'READ';
      await this._beginTransaction(client, isReadOnly);

      // Set statement timeout if specified
      if (config.timeout) {
        await client.query(`SET statement_timeout = ${config.timeout}`);
      }

      // Handle parameter substitution
      // PostgreSQL (pg library) uses $1, $2, etc. for positional parameters
      const paramValues = Object.values(params);

      // Start timing
      const startTime = Date.now();

      // Execute query with positional parameters
      const result = await client.query(query, paramValues);

      // Commit transaction
      await client.query('COMMIT');

      const executionTime = Date.now() - startTime;
      const rowCount = result.rowCount || 0;
      const isTruncated = rowCount > config.rowLimit;

      // Extract schema if callback is provided
      if (callbacks.setSchema && result.fields) {
        const schema = extractTableSchemaFromFields(result.fields);
        callbacks.setSchema(schema);
      }

      // Determine query status
      let status = QueryStatus.COMPLETE;
      if (rowCount === 0) {
        status = QueryStatus.NO_DATA;
      } else if (isTruncated) {
        status = QueryStatus.COMPLETE_TRUNCATED;
      }

      callbacks.setStatus?.(status);

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

      // Create result with metadata for compatibility
      const resultWithMetadata = config.parseToNeodashRecord
        ? {
            fields: result.fields
              ? result.fields.map((field) => ({
                  name: field.name,
                  type: (this.parser as any).pgTypeToColumnType(field.dataTypeID),
                }))
              : [],
            records: parsedRecords,
            summary: {
              rowCount,
              executionTime,
              queryType: isReadOnly ? 'read' : 'write',
              database: 'postgresql',
            },
          }
        : parsedRecords;

      callbacks.onSuccess?.(resultWithMetadata as T);
    } catch (error: unknown) {
      // Rollback transaction on error
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Error during rollback:', rollbackError);
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
  async checkConnection(): Promise<boolean> {
    try {
      const pool = this.authModule.getPool();
      if (!pool) {
        // Try to authenticate first
        const authenticated = await this.authModule.authenticate();
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
      console.error('Connection check failed:', error);
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
