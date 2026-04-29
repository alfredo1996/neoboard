import {
  createConnectionModule,
  DEFAULT_CONNECTION_CONFIG,
  ConnectionTypes,
} from "@/lib/connector/connection-adapter";
import { ensureDatabaseInUri, rewriteParamsForPostgres } from "./query-params";
import type { ConnectorType } from "@/lib/connector/connector-types";
import { QueryStatus } from "@neoboard/connection";

/**
 * Default row cap applied to read queries when a connection doesn't
 * specify its own `maxRows`. Matches the connection package's own
 * `DEFAULT_CONNECTION_CONFIG.rowLimit` value (5000). Exported so the
 * API route can echo the effective cap back to the client and the UI
 * banner can render the right number.
 */
export const DEFAULT_MAX_ROWS = 5000;

export interface ConnectionCredentials {
  uri: string;
  username: string;
  password: string;
  database?: string;
  // Advanced pool/timeout settings (optional)
  connectionTimeout?: number;
  queryTimeout?: number;
  maxPoolSize?: number;
  connectionAcquisitionTimeout?: number;
  idleTimeout?: number;
  statementTimeout?: number;
  sslRejectUnauthorized?: boolean;
  /**
   * Max rows returned per read query on this connection. When unset,
   * DEFAULT_MAX_ROWS is used. Queries returning more than this many rows
   * are silently truncated by the driver; the API response carries a
   * `truncated: true` flag in meta so the UI can render a banner.
   */
  maxRows?: number;
}

export type DbType = ConnectorType;

/** Numeric type for connection module config (legacy enum). */
function toConnectionTypeEnum(type: DbType): number {
  return type === "neo4j" ? ConnectionTypes.NEO4J : ConnectionTypes.POSTGRESQL;
}

/** Cache of connection modules keyed by type+uri+username+database. */
const moduleCache = new Map<string, unknown>();

function getCacheKey(type: DbType, credentials: ConnectionCredentials): string {
  const advancedKey = [
    credentials.connectionTimeout,
    credentials.queryTimeout,
    credentials.maxPoolSize,
    credentials.connectionAcquisitionTimeout,
    credentials.idleTimeout,
    credentials.statementTimeout,
    credentials.sslRejectUnauthorized,
    credentials.maxRows,
  ].join(",");
  return `${type}|${credentials.uri}|${credentials.username}|${credentials.database ?? ""}|${advancedKey}`;
}

function buildAdvancedOptions(credentials: ConnectionCredentials) {
  return {
    neo4jConnectionTimeout: credentials.connectionTimeout,
    neo4jQueryTimeout: credentials.queryTimeout,
    neo4jMaxPoolSize: credentials.maxPoolSize,
    neo4jAcquisitionTimeout: credentials.connectionAcquisitionTimeout,
    pgConnectionTimeoutMillis: credentials.connectionTimeout,
    pgIdleTimeoutMillis: credentials.idleTimeout,
    pgMaxPoolSize: credentials.maxPoolSize,
    pgStatementTimeout:
      credentials.statementTimeout ?? credentials.queryTimeout,
    pgSslRejectUnauthorized: credentials.sslRejectUnauthorized,
  };
}

function getOrCreateModule(
  type: DbType,
  credentials: ConnectionCredentials,
): unknown {
  const key = getCacheKey(type, credentials);
  let connModule = moduleCache.get(key);
  if (!connModule) {
    const authConfig = {
      uri: ensureDatabaseInUri(credentials.uri, credentials.database),
      username: credentials.username,
      password: credentials.password,
      authType: 1, // NATIVE
    };
    const advancedOptions = buildAdvancedOptions(credentials);
    connModule = createConnectionModule(
      type, // string type for registry lookup
      authConfig,
      advancedOptions,
    );
    moduleCache.set(key, connModule);
  }
  return connModule;
}

/**
 * Execute a query against a database connection.
 *
 * Returns the query result plus two pieces of driver-reported metadata:
 *
 *   - `truncated` — true when the driver returned fewer rows than the
 *     query produced because it hit the configured row limit. Surfaced
 *     via `setStatus(QueryStatus.COMPLETE_TRUNCATED)` from both the
 *     PostgreSQL and Neo4j connector modules.
 *   - `rowLimit` — the effective cap used for this query (either the
 *     connection's `maxRows` override or `DEFAULT_MAX_ROWS`). The API
 *     route echoes this back in `meta` so the UI banner can render the
 *     correct number.
 */
export async function executeQuery(
  type: DbType,
  credentials: ConnectionCredentials,
  queryParams: { query: string; params?: Record<string, unknown> },
  options?: { accessMode?: "READ" | "WRITE" },
): Promise<{
  data: unknown;
  fields?: unknown;
  truncated: boolean;
  rowLimit: number;
}> {
  const connModule = getOrCreateModule(type, credentials) as {
    runQuery: (
      params: unknown,
      callbacks: Record<string, unknown>,
      config: unknown,
    ) => void;
  };

  const effectiveRowLimit = credentials.maxRows ?? DEFAULT_MAX_ROWS;

  const config = {
    ...DEFAULT_CONNECTION_CONFIG,
    connectionType: toConnectionTypeEnum(type),
    database: credentials.database,
    rowLimit: effectiveRowLimit,
    ...(options?.accessMode ? { accessMode: options.accessMode } : {}),
    ...(credentials.queryTimeout ? { timeout: credentials.queryTimeout } : {}),
    ...(credentials.connectionTimeout
      ? { connectionTimeout: credentials.connectionTimeout }
      : {}),
  };

  // PostgreSQL uses positional $1, $2 params — rewrite $param_xxx tokens
  let finalQueryParams = queryParams;
  if (
    type === "postgresql" &&
    queryParams.params &&
    Object.keys(queryParams.params).length > 0
  ) {
    finalQueryParams = rewriteParamsForPostgres(
      queryParams.query,
      queryParams.params,
    );
  }

  return new Promise((resolve, reject) => {
    // Track truncation via setStatus — both connectors call
    // `callbacks.setStatus(COMPLETE_TRUNCATED)` when they hit the
    // rowLimit cap. Previously this callback was unimplemented and
    // the signal was silently dropped.
    let truncated = false;
    connModule.runQuery(
      finalQueryParams,
      {
        onSuccess: (result: unknown) =>
          resolve({
            data: result,
            truncated,
            rowLimit: effectiveRowLimit,
          }),
        onFail: (error: unknown) => reject(error),
        setFields: () => {},
        setSchema: () => {},
        setStatus: (status: QueryStatus) => {
          if (status === QueryStatus.COMPLETE_TRUNCATED) {
            truncated = true;
          }
        },
      },
      config,
    );
  });
}

/**
 * Test a database connection.
 */
export async function testConnection(
  type: DbType,
  credentials: ConnectionCredentials,
): Promise<boolean> {
  const connModule = getOrCreateModule(type, credentials) as {
    checkConnection: (config: unknown) => Promise<boolean>;
  };

  const config = {
    ...DEFAULT_CONNECTION_CONFIG,
    connectionType: toConnectionTypeEnum(type),
    database: credentials.database,
  };

  return connModule.checkConnection(config);
}

/**
 * List available databases on the connection server.
 * Returns an empty array if the operation is unsupported or fails.
 */
export async function listDatabases(
  type: DbType,
  credentials: ConnectionCredentials,
): Promise<string[]> {
  const connModule = getOrCreateModule(type, credentials) as {
    listDatabases: () => Promise<string[]>;
  };
  return connModule.listDatabases();
}

/**
 * List available schemas in the current database (PostgreSQL only).
 * Returns an empty array if the operation is unsupported or fails.
 */
export async function listSchemas(
  type: DbType,
  credentials: ConnectionCredentials,
): Promise<string[]> {
  const connModule = getOrCreateModule(type, credentials) as {
    listSchemas?: () => Promise<string[]>;
  };
  if (typeof connModule.listSchemas !== "function") return [];
  return connModule.listSchemas();
}
