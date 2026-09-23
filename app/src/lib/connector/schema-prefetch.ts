import type { ConnectionCredentials } from "@/lib/query/query-executor";
import { getSchemaManager } from "@/lib/connector/connection-adapter";
import { driverConfig } from "@/lib/connector/container-host";

/**
 * Fetch the database schema for a given connection.
 * Used both by the schema API route and as a fire-and-forget prefetch
 * after connection create/update.
 */
export async function fetchConnectionSchema(
  type: string,
  credentials: ConnectionCredentials,
): Promise<unknown> {
  // Registry-keyed dispatch (#1119) — no hardcoded per-type branching.
  const manager = getSchemaManager(type);
  if (!manager) return null; // connector type has no schema introspection
  // Built exactly as the query path builds it, so the schema comes from the
  // same host as the connection's queries (#1919).
  return manager.fetchSchema(await driverConfig(credentials));
}

/**
 * Fire-and-forget schema prefetch after connection save.
 * Errors are swallowed — schema is a cache; failure is non-critical.
 */
export function prefetchSchema(
  type: string,
  credentials: ConnectionCredentials,
): void {
  fetchConnectionSchema(type, credentials).catch(() => {
    // Non-critical: schema prefetch failure should not surface to the user
  });
}
