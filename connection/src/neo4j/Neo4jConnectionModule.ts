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
import {
  DEFAULT_CONNECTION_CONFIG,
  determineQueryStatus,
} from "@neoboard/connector-sdk";
import { collectUpToLimit, drainRetainingUpTo } from "@neoboard/connector-sdk";
import { wrapError, ConnectorErrorType } from "@neoboard/connector-sdk";
import { toNeo4jParams } from "./coerce-params";

/**
 * Transaction config for the hardcoded introspection and health-check queries,
 * which ran with no timeout at all (#1302).
 *
 * ponytail: `timeout` is enforced by the server. The driver has no client-side
 * query bound, so a server that accepts the connection and then stops
 * answering still hangs the await; bound it at the caller if that shows up.
 */
const INTROSPECTION_TX_CONFIG = { timeout: DEFAULT_CONNECTION_CONFIG.timeout };

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
    const payload = await this._runCypherQuery<T>(
      query,
      callbacks,
      config,
      params,
    );
    // Delivered here, outside _runCypherQuery's try, so a throwing consumer
    // handler is not caught as a query failure — no ERROR status, no onFail.
    // It rejects runQuery instead, which is the caller's own error to handle
    // (#1642).
    if (payload !== undefined) callbacks.onSuccess?.(payload);
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
    // Integral numbers must reach Cypher as Integers, not Floats, or
    // `LIMIT $param` / `SKIP $param` are rejected outright (#1518). Done once
    // here rather than at each tx.run below, so the read and write paths
    // cannot drift.
    const boundParams = toNeo4jParams(params);

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
            // Writes must run to completion so every side effect executes — but
            // that argues for DRAINING the stream, not for retaining it. The
            // old code awaited tx.run(), which buffers every record into
            // QueryResult.records before the slice, so one Form submit against
            // a large table could exhaust the heap shared by every tenant on
            // the process (#1298). Draining pulls each record — all side
            // effects run — while keeping only rowLimit of them.
            return drainRetainingUpTo(
              tx.run(query, boundParams),
              config.rowLimit,
            );
          }
          // Reads stream lazily: do NOT await tx.run(...) (awaiting buffers the
          // whole result set). The Result is async-iterable, so stop after
          // rowLimit + 1 records (the MAX_ROWS+1 truncation probe) — peak memory
          // stays bounded regardless of how many rows match.
          const res = tx.run(query, boundParams);
          return collectUpToLimit(res, config.rowLimit);
        },
        {
          // Sets dbms.transaction.timeout for this transaction. A falsy value
          // would mean the server default (unlimited on Neo4j 5) or no timeout
          // at all, so fall back to the documented default like PostgreSQL (#1302).
          timeout: config.timeout || DEFAULT_CONNECTION_CONFIG.timeout,
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
      return parsedResult as T;
    } catch (err: unknown) {
      const wrapped = wrapError(err, "neo4j");
      callbacks.setStatus?.(
        wrapped.type === ConnectorErrorType.TIMEOUT
          ? QueryStatus.TIMED_OUT
          : QueryStatus.ERROR,
      );
      callbacks.onFail?.(wrapped);
      return undefined;
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
        {},
        INTROSPECTION_TX_CONFIG,
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
      await session.run("RETURN 1 AS connected", {}, INTROSPECTION_TX_CONFIG);
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
