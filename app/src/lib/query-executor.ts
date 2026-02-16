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

/**
 * Execute a query against a database connection.
 */
export async function executeQuery(
  type: DbType,
  credentials: ConnectionCredentials,
  queryParams: { query: string; params?: Record<string, unknown> },
): Promise<{ data: unknown; fields?: unknown }> {
  const connectionType = toConnectionType(type);
  const authConfig = {
    uri: credentials.uri,
    username: credentials.username,
    password: credentials.password,
    authType: 1, // NATIVE
  };

  const module = connectionModule.createConnectionModule(connectionType, authConfig);

  const config = {
    ...connectionInterfaces.DEFAULT_CONNECTION_CONFIG,
    connectionType,
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
  const connectionType = toConnectionType(type);
  const authConfig = {
    uri: credentials.uri,
    username: credentials.username,
    password: credentials.password,
    authType: 1,
  };

  const module = connectionModule.createConnectionModule(connectionType, authConfig);

  const config = {
    ...connectionInterfaces.DEFAULT_CONNECTION_CONFIG,
    connectionType,
    database: credentials.database,
  };

  return module.checkConnection(config);
}
