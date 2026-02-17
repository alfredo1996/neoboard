// Import from connection module source (CJS, no build step)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const connectionModule = require("connection/src/adapters/factory");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const connectionInterfaces = require("connection/src/generalized/interfaces");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const connectionConfig = require("connection/src/ConnectionModuleConfig");

export interface ConnectionCredentials {
  uri: string;
  username: string;
  password: string;
  database?: string;
}

export type DbType = "neo4j" | "postgresql";

function toConnectionType(type: DbType): number {
  return type === "neo4j"
    ? connectionConfig.ConnectionTypes.NEO4J
    : connectionConfig.ConnectionTypes.POSTGRESQL;
}

/** Cache of connection modules keyed by type+uri+username+database. */
const moduleCache = new Map<string, unknown>();

function getCacheKey(type: DbType, credentials: ConnectionCredentials): string {
  return `${type}|${credentials.uri}|${credentials.username}|${credentials.database ?? ""}`;
}

function getOrCreateModule(type: DbType, credentials: ConnectionCredentials): unknown {
  const key = getCacheKey(type, credentials);
  let module = moduleCache.get(key);
  if (!module) {
    const connectionType = toConnectionType(type);
    const authConfig = {
      uri: credentials.uri,
      username: credentials.username,
      password: credentials.password,
      authType: 1, // NATIVE
    };
    module = connectionModule.createConnectionModule(connectionType, authConfig);
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
): Promise<{ data: unknown; fields?: unknown }> {
  const module = getOrCreateModule(type, credentials) as {
    runQuery: (
      params: unknown,
      callbacks: Record<string, unknown>,
      config: unknown,
    ) => void;
  };

  const config = {
    ...connectionInterfaces.DEFAULT_CONNECTION_CONFIG,
    connectionType: toConnectionType(type),
    database: credentials.database,
  };

  return new Promise((resolve, reject) => {
    module.runQuery(
      queryParams,
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
    ...connectionInterfaces.DEFAULT_CONNECTION_CONFIG,
    connectionType: toConnectionType(type),
    database: credentials.database,
  };

  return module.checkConnection(config);
}
