import type { ConnectionCredentials } from "@/lib/query/query-executor";
import type { ConnectorType } from "@/lib/connector/connector-types";
import { ensureDatabaseInUri } from "@/lib/query/query-params";
import {
  Neo4jSchemaManager,
  PostgresSchemaManager,
} from "@neoboard/connection";

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
 */
export async function fetchConnectionSchema(
  type: ConnectorType,
  credentials: ConnectionCredentials,
): Promise<unknown> {
  const authConfig = buildAuthConfig(credentials);

  if (type === "neo4j") {
    const manager = new Neo4jSchemaManager();
    return manager.fetchSchema(authConfig);
  } else {
    const manager = new PostgresSchemaManager();
    return manager.fetchSchema(authConfig);
  }
}

/**
 * Fire-and-forget schema prefetch after connection save.
 * Errors are swallowed — schema is a cache; failure is non-critical.
 */
export function prefetchSchema(
  type: ConnectorType,
  credentials: ConnectionCredentials,
): void {
  fetchConnectionSchema(type, credentials).catch(() => {
    // Non-critical: schema prefetch failure should not surface to the user
  });
}
