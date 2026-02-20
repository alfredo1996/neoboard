import type { ConnectionCredentials } from "@/lib/query-executor";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Neo4jSchemaManager } = require("connection/src/schema/neo4j-schema");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PostgresSchemaManager } = require("connection/src/schema/pg-schema");

/**
 * Fetch the database schema for a given connection.
 * Used both by the schema API route and as a fire-and-forget prefetch
 * after connection create/update.
 */
export async function fetchConnectionSchema(
  type: "neo4j" | "postgresql",
  credentials: ConnectionCredentials
) {
  const authConfig = {
    uri: credentials.uri,
    username: credentials.username,
    password: credentials.password,
    authType: 1, // AuthType.NATIVE
  };

  if (type === "neo4j") {
    const manager = new Neo4jSchemaManager() as { fetchSchema: (a: typeof authConfig) => Promise<unknown> };
    return manager.fetchSchema(authConfig);
  } else {
    const manager = new PostgresSchemaManager() as { fetchSchema: (a: typeof authConfig) => Promise<unknown> };
    return manager.fetchSchema(authConfig);
  }
}

/**
 * Fire-and-forget schema prefetch after connection save.
 * Errors are swallowed — schema is a cache; failure is non-critical.
 */
export function prefetchSchema(
  type: "neo4j" | "postgresql",
  credentials: ConnectionCredentials
): void {
  fetchConnectionSchema(type, credentials).catch(() => {
    // Non-critical: schema prefetch failure should not surface to the user
  });
}
