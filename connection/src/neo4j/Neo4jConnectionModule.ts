import { ConnectionModule } from '../generalized/ConnectionModule';
import neo4j, { ManagedTransaction } from 'neo4j-driver';
import { Neo4jAuthenticationModule } from './Neo4jAuthenticationModule';
import { Driver } from 'neo4j-driver-core';
import { AuthConfig, ConnectionConfig, QueryCallback, QueryParams, QueryStatus } from '../generalized/interfaces';
import { Neo4jRecordParser } from './Neo4jRecordParser';
import { extractNodeAndRelPropertiesFromRecords, errorHasMessage } from './utils';

/**
 * Neo4jConnectionModule
 * Handles connection, query execution, and transaction management for a Neo4j database.
 */
export class Neo4jConnectionModule extends ConnectionModule {
  authModule: Neo4jAuthenticationModule;
  private readonly parser: Neo4jRecordParser;

  /**
   * Creates a new Neo4jConnectionModule instance.
   * @param config - The connection configuration object.
   */
  constructor(config: AuthConfig) {
    super();
    this.authModule = new Neo4jAuthenticationModule(config);
    this.parser = new Neo4jRecordParser();
  }

  getDriver(): Driver {
    return this.authModule.getDriver();
  }

  /**
   * Executes a Cypher query in a managed transaction (read or write mode).
   * Supports success and failure callbacks.
   *
   * @param queryParams - An object containing the Cypher query and parameters.
   * @param callbacks - Object containing onSuccess and onFail callbacks.
   * @param config - Object that contains accessMode
   * @returns A promise resolving to the parsed result of the query.
   */
  async runQuery<T>(
    queryParams: QueryParams, // Now we accept the whole object as parameter
    callbacks: QueryCallback<T>, // Accept the callbacks as an object
    config: ConnectionConfig
  ) {
    const { query, params = {} } = queryParams; // Destructure query and params
    if (callbacks.setStatus) {
      if (!query || query.trim() === '') {
        callbacks.setStatus(QueryStatus.NO_QUERY);
        return;
      }
      callbacks.setStatus(QueryStatus.RUNNING);
    }
    return this._runCypherQuery(query, callbacks, config, params);
  }

  /**
   * Executes a Cypher query inside a transaction.
   *
   * @param query - The Cypher query to execute.
   * @param params - The parameters to pass to the query.
   * @param config - Connection configuration object.
   * @param callbacks - Object containing onSuccess, onFail and setStatus callbacks.
   * @returns A promise resolving to the query result.
   */
  private async _runCypherQuery<T>(
    query: string,
    callbacks: QueryCallback<T>,
    config: ConnectionConfig,
    params: Record<string, any> = {}
  ) {
    const session = this.getDriver().session({
      defaultAccessMode: neo4j.session[config.accessMode],
      database: config.database,
    });
    const execute =
      config.accessMode === 'WRITE' ? session.executeWrite.bind(session) : session.executeRead.bind(session);
    try {
      const result = await execute(
        async (tx: ManagedTransaction) => {
          const res = await tx.run(query, params); // Pass params to the run method
          return res.records;
        },
        { timeout: config.connectionTimeout } // Pass connectionTimeout to the executeRead method
      );
      // Set schema if provided
      callbacks.setSchema?.(extractNodeAndRelPropertiesFromRecords(result));

      // TODO: Truncation should happen at db level
      const toTruncate = result.length > config.rowLimit;
      let status = QueryStatus.COMPLETE;
      if (result.length === 0) status = QueryStatus.NO_DATA;
      else if (result.length > config.rowLimit) status = QueryStatus.COMPLETE_TRUNCATED;

      callbacks.setStatus?.(status);
      const limitedResult = toTruncate ? (result.slice(0, config.rowLimit) as any) : result;
      const parsedResult = config.parseToNeodashRecord ? this.parser.bulkParse(limitedResult) : limitedResult;
      // Calls `setFields` only if explicitly enabled (e.g., via `toSetFields`).
      // This avoids redundant updates for reports like Graph Interactivity
      // that don't need to reset fields after each result.
      if (callbacks.setFields) {
        if (parsedResult.length > 0) {
          const parsed = this.parser.bulkParse([result[0]]);
          callbacks.setFields(parsed[0].getFields(config.useNodePropsAsFields));
        } else {
          callbacks.setFields([]);
        }
      }
      callbacks.onSuccess?.(parsedResult);
    } catch (err: unknown) {
      if (errorHasMessage(err)) {
        const isTimeout = err.message.startsWith('The transaction has been terminated');
        callbacks.setStatus?.(isTimeout ? QueryStatus.TIMED_OUT : QueryStatus.ERROR);
      }
      callbacks.onFail?.(err);
    } finally {
      await session.close();
    }
  }

  /**
   * Checks if the database connection is working by running a simple query.
   * @returns Promise<boolean> - true if connection is valid, otherwise throws.
   * @param connectionConfig
   */
  async checkConnection(connectionConfig: ConnectionConfig): Promise<boolean> {
    const driver = this.authModule.getDriver();
    const session = driver.session({
      defaultAccessMode: neo4j.session[connectionConfig.accessMode],
      database: connectionConfig.database,
    });
    try {
      await session.run('RETURN 1 AS connected');
      return true;
    } catch (error) {
      console.error('Connection check failed:', error);
      throw error;
    } finally {
      await session.close();
    }
  }
}
