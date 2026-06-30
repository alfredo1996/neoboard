import { ConnectionModule } from "@neoboard/connector-sdk";
import neo4j, { ManagedTransaction } from "neo4j-driver";
import { Neo4jAuthenticationModule } from "./Neo4jAuthenticationModule";
import { Driver } from "neo4j-driver-core";
import {
  AuthConfig,
  Neo4jAdvancedOptions,
  ConnectionConfig,
  QueryCallback,
  QueryParams,
  QueryStatus,
} from "@neoboard/connector-sdk";
import { Neo4jRecordParser } from "./Neo4jRecordParser";
import { extractNodeAndRelPropertiesFromRecords } from "./utils";
import { determineQueryStatus } from "@neoboard/connector-sdk";
import { collectUpToLimit } from "@neoboard/connector-sdk";
import { wrapError, ConnectorErrorType } from "@neoboard/connector-sdk";

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
   * @param advancedOptions - Optional advanced pool/timeout settings.
   */
  constructor(config: AuthConfig, advancedOptions?: Neo4jAdvancedOptions) {
    super();
    this.authModule = new Neo4jAuthenticationModule(config, advancedOptions);
    this.parser = new Neo4jRecordParser();
  }

  getDriver(): Driver {
    return this.authModule.getDriver();
  }

  /**
   * Close the underlying driver and release all pooled connections.
   */
  async close(): Promise<void> {
    await this.authModule.close();
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
    config: ConnectionConfig,
  ) {
    const { query, params = {} } = queryParams;
    if (this.handleEmptyQuery(query, callbacks)) return;
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
    params: Record<string, unknown> = {},
  ) {
    const session = this.getDriver().session({
      defaultAccessMode: neo4j.session[config.accessMode],
      database: config.database,
    });
    const isWrite = config.accessMode === "WRITE";
    const execute = isWrite
      ? session.executeWrite.bind(session)
      : session.executeRead.bind(session);
    try {
      const { rows: records, truncated } = await execute(
        async (tx: ManagedTransaction) => {
          if (isWrite) {
            // Writes must run to completion so every side effect executes; we
            // only truncate what we hand back for display. Stopping a write
            // stream early could skip un-pulled CREATE/SET/DELETE work, leaving
            // a partially-applied transaction.
            const res = await tx.run(query, params);
            const all = res.records;
            const writeTruncated = all.length > config.rowLimit;
            return {
              rows: writeTruncated ? all.slice(0, config.rowLimit) : all,
              truncated: writeTruncated,
            };
          }
          // Reads stream lazily: do NOT await tx.run(...) (awaiting buffers the
          // whole result set). The Result is async-iterable, so stop after
          // rowLimit + 1 records (the MAX_ROWS+1 truncation probe) — peak memory
          // stays bounded regardless of how many rows match.
          const res = tx.run(query, params);
          return collectUpToLimit(res, config.rowLimit);
        },
        {
          timeout: config.timeout, // Sets dbms.transaction.timeout for this transaction.
          // Note: this covers the entire transaction lifecycle, not just query execution.
          // Very long-running queries within the timeout window will still complete.
        },
      );
      // Set schema if provided. Derived from the retained (≤ rowLimit) records,
      // which is sufficient for the field/property panel.
      callbacks.setSchema?.(extractNodeAndRelPropertiesFromRecords(records));

      // Streamed count is capped at rowLimit + 1, which yields the same status
      // as the true count would (> rowLimit ⇒ truncated).
      const rowCount = truncated ? config.rowLimit + 1 : records.length;
      callbacks.setStatus?.(determineQueryStatus(rowCount, config.rowLimit));
      // The driver's Record generics don't unify with the parser's
      // Record<string, unknown>[] input even though the runtime shape is
      // exactly that — bridge the identities once at the result boundary.
      const limitedResult = records as unknown as Record<string, unknown>[];
      const parsedResult = config.parseToNeodashRecord
        ? this.parser.bulkParse(limitedResult)
        : limitedResult;
      // Calls `setFields` only if explicitly enabled (e.g., via `toSetFields`).
      // This avoids redundant updates for reports like Graph Interactivity
      // that don't need to reset fields after each result.
      if (callbacks.setFields) {
        if (parsedResult.length > 0) {
          const parsed = this.parser.bulkParse([limitedResult[0]]);
          callbacks.setFields(parsed[0].getFields(config.useNodePropsAsFields));
        } else {
          callbacks.setFields([]);
        }
      }
      callbacks.onSuccess?.(parsedResult as T);
    } catch (err: unknown) {
      const wrapped = wrapError(err, "neo4j");
      callbacks.setStatus?.(
        wrapped.type === ConnectorErrorType.TIMEOUT
          ? QueryStatus.TIMED_OUT
          : QueryStatus.ERROR,
      );
      callbacks.onFail?.(wrapped);
    } finally {
      await session.close();
    }
  }

  /**
   * Lists available databases on the Neo4j server.
   * Uses SHOW DATABASES (Neo4j 4.x+). Filters out the "system" database
   * and any databases that are not online.
   * Returns an empty array if SHOW DATABASES is not supported (Neo4j < 4.x)
   * or if the query fails for any reason (graceful fallback).
   */
  async listDatabases(): Promise<string[]> {
    const driver = this.getDriver();
    const session = driver.session({
      defaultAccessMode: neo4j.session.READ,
      database: "system",
    });
    try {
      const result = await session.run(
        "SHOW DATABASES YIELD name, currentStatus WHERE name <> 'system' AND currentStatus = 'online' RETURN name",
      );
      return result.records.map((r) => r.get("name") as string);
    } catch {
      // Graceful fallback: SHOW DATABASES not supported or permission denied
      return [];
    } finally {
      await session.close();
    }
  }

  /**
   * Checks if the database connection is working by running a simple query.
   * @returns Promise<boolean> - true if connection is valid, otherwise throws.
   * @param connectionConfig
   */
  async checkConnection(connectionConfig?: ConnectionConfig): Promise<boolean> {
    const driver = this.authModule.getDriver();
    const session = driver.session({
      defaultAccessMode: neo4j.session[connectionConfig?.accessMode ?? "READ"],
      database: connectionConfig?.database,
    });
    try {
      await session.run("RETURN 1 AS connected");
      return true;
    } catch (error) {
      const wrapped = wrapError(error, "neo4j");
      // Log only error type — never the full error object which may contain credentials
      console.warn("Connection check failed:", wrapped.type);
      throw wrapped;
    } finally {
      await session.close();
    }
  }
}
