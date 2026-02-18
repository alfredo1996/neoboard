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

/** Ensure the database is encoded in the URI for drivers that extract it from the path. */
function ensureDatabaseInUri(uri: string, database?: string): string {
  if (!database) return uri;
  try {
    const url = new URL(uri);
    // If the URI already has a non-empty path (database), don't override
    if (url.pathname && url.pathname !== "/") return uri;
    url.pathname = `/${database}`;
    return url.toString();
  } catch {
    return uri;
  }
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
    module = connectionModule.createConnectionModule(connectionType, authConfig);
    moduleCache.set(key, module);
  }
  return module;
}

/**
 * Rewrites `$param_xxx` named placeholders to PostgreSQL positional `$1, $2, ...`
 * parameters and builds the matching ordered values array.
 *
 * Neo4j natively supports `$param_xxx` syntax, so this is only needed for PostgreSQL.
 */
function rewriteParamsForPostgres(
  query: string,
  params: Record<string, unknown>,
): { query: string; params: Record<string, unknown> } {
  const tokenRegex = /\$param_(\w+)/g;
  const seen = new Map<string, number>();
  const values: unknown[] = [];
  let positionalIndex = 0;

  const rewritten = query.replace(tokenRegex, (token) => {
    // Re-use the same positional index if the same token appears multiple times
    if (seen.has(token)) {
      return `$${seen.get(token)}`;
    }
    positionalIndex++;
    seen.set(token, positionalIndex);

    // The param key in the map uses the full "param_xxx" form (set by extractReferencedParams)
    const paramKey = token.slice(1); // strip leading '$'
    values.push(params[paramKey]);
    return `$${positionalIndex}`;
  });

  // Build a numeric-keyed object so Object.values() preserves insertion order
  const positionalParams: Record<string, unknown> = {};
  for (let i = 0; i < values.length; i++) {
    positionalParams[String(i)] = values[i];
  }

  return { query: rewritten, params: positionalParams };
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
    ...connectionInterfaces.DEFAULT_CONNECTION_CONFIG,
    connectionType: toConnectionType(type),
    database: credentials.database,
  };

  return module.checkConnection(config);
}
