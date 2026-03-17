import { createConnectionModule, DEFAULT_CONNECTION_CONFIG, ConnectionTypes } from "./connection-adapter";
import { ensureDatabaseInUri, rewriteParamsForPostgres } from "./query-params";

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
}

export type DbType = "neo4j" | "postgresql";

function toConnectionType(type: DbType): number {
  return type === "neo4j"
    ? ConnectionTypes.NEO4J
    : ConnectionTypes.POSTGRESQL;
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
    pgStatementTimeout: credentials.statementTimeout ?? credentials.queryTimeout,
    pgSslRejectUnauthorized: credentials.sslRejectUnauthorized,
  };
}

function getOrCreateModule(type: DbType, credentials: ConnectionCredentials): unknown {
  const key = getCacheKey(type, credentials);
  let module = moduleCache.get(key);
  if (!module) {
    const connectionType = toConnectionType(type);
    const authConfig = {
      uri: ensureDatabaseInUri(credentials.uri, credentials.database),
      username: credentials.username,
      password: credentials.password,
      authType: 1, // NATIVE
    };
    const advancedOptions = buildAdvancedOptions(credentials);
    module = createConnectionModule(connectionType, authConfig, advancedOptions);
    moduleCache.set(key, module);
  }
  return module;
}

/**
 * Execute a query against a database connection.
 */
export async function executeQuery(
  type: DbType,
  credentials: ConnectionCredentials,
  queryParams: { query: string; params?: Record<string, unknown> },
  options?: { accessMode?: "READ" | "WRITE" },
): Promise<{ data: unknown; fields?: unknown }> {
  const module = getOrCreateModule(type, credentials) as {
    runQuery: (
      params: unknown,
      callbacks: Record<string, unknown>,
      config: unknown,
    ) => void;
  };

  const config = {
    ...DEFAULT_CONNECTION_CONFIG,
    connectionType: toConnectionType(type),
    database: credentials.database,
    ...(options?.accessMode ? { accessMode: options.accessMode } : {}),
    ...(credentials.queryTimeout ? { timeout: credentials.queryTimeout } : {}),
    ...(credentials.connectionTimeout ? { connectionTimeout: credentials.connectionTimeout } : {}),
  };

  // PostgreSQL uses positional $1, $2 params — rewrite $param_xxx tokens
  let finalQueryParams = queryParams;
  if (type === "postgresql" && queryParams.params && Object.keys(queryParams.params).length > 0) {
    finalQueryParams = rewriteParamsForPostgres(queryParams.query, queryParams.params);
  }

  return new Promise((resolve, reject) => {
    module.runQuery(
      finalQueryParams,
      {
        onSuccess: (result: unknown) => resolve({ data: result }),
        onFail: (error: unknown) => reject(error),
        setFields: () => {},
        setSchema: () => {},
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
  const module = getOrCreateModule(type, credentials) as {
    checkConnection: (config: unknown) => Promise<boolean>;
  };

  const config = {
    ...DEFAULT_CONNECTION_CONFIG,
    connectionType: toConnectionType(type),
    database: credentials.database,
  };

  return module.checkConnection(config);
}
