import type { ConnectionCredentials } from "@/lib/query-executor";
import { ensureDatabaseInUri } from "@/lib/query-params";

/**
 * Builds the auth configuration object for schema manager calls.
 * Exported for unit testing in isolation.
 */
export function buildAuthConfig(credentials: ConnectionCredentials) {
  return {
    uri: ensureDatabaseInUri(credentials.uri, credentials.database),
    username: credentials.username,
    password: credentials.password,
    authType: 1 as const, // AuthType.NATIVE
  };
}

/**
 * Fetch the database schema for a given connection.
 * Used both by the schema API route and as a fire-and-forget prefetch
 * after connection create/update.
 *
 * The connection package modules are required lazily (inside the function)
 * so that this module can be imported in test environments without needing
 * the compiled connection package to be available at module load time.
 */
export async function fetchConnectionSchema(
  type: "neo4j" | "postgresql",
  credentials: ConnectionCredentials,
): Promise<unknown> {
  const authConfig = buildAuthConfig(credentials);

  if (type === "neo4j") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Neo4jSchemaManager } = require("connection/src/schema/neo4j-schema") as {
      Neo4jSchemaManager: new () => { fetchSchema: (a: typeof authConfig) => Promise<unknown> };
    };
    const manager = new Neo4jSchemaManager();
    return manager.fetchSchema(authConfig);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PostgresSchemaManager } = require("connection/src/schema/pg-schema") as {
      PostgresSchemaManager: new () => { fetchSchema: (a: typeof authConfig) => Promise<unknown> };
    };
    const manager = new PostgresSchemaManager();
    return manager.fetchSchema(authConfig);
  }
}

/**
 * Fire-and-forget schema prefetch after connection save.
 * Errors are swallowed — schema is a cache; failure is non-critical.
 */
export function prefetchSchema(
  type: "neo4j" | "postgresql",
  credentials: ConnectionCredentials,
): void {
  fetchConnectionSchema(type, credentials).catch(() => {
    // Non-critical: schema prefetch failure should not surface to the user
  });
}
