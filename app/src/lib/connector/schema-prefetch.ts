import type { ConnectionCredentials } from "@/lib/query/query-executor";
import {
  describeConnectionTerms,
  getSchemaManager,
} from "@/lib/connector/connection-adapter";
import type { SchemaTerm } from "@neoboard/connection";
import type { DatabaseSchema } from "@neoboard/connection";
import { driverConfig } from "@/lib/connector/container-host";
import {
  cachedIntrospection,
  type IntrospectionScope,
} from "@/lib/connector/schema-cache";

/** Whose connection is read, and whether to read it live (#2514). */
export interface SchemaScope extends IntrospectionScope {
  /** Skip the cache: the Model page's and the editor's Refresh. */
  refresh?: boolean;
}

/**
 * Fetch the database schema for a given connection.
 * Used both by the schema API route and as a fire-and-forget prefetch
 * after connection create/update.
 */
export async function fetchConnectionSchema(
  type: string,
  credentials: ConnectionCredentials,
  scope: SchemaScope,
): Promise<unknown> {
  // Registry-keyed dispatch (#1119) — no hardcoded per-type branching.
  const manager = getSchemaManager(type);
  if (!manager) return null; // connector type has no schema introspection
  // One read per connection serves the schema and the terms (#2514).
  return cachedIntrospection(
    scope,
    async () =>
      // Built exactly as the query path builds it, so the schema comes from
      // the same host as the connection's queries (#1919).
      manager.fetchSchema(await driverConfig(credentials)),
    scope,
  );
}

/**
 * The connection's data-model terms (#2415), read through the same path as
 * its schema: the connector's own list, or its schema adapted, `[]` for a
 * connector that describes no structure.
 */
export async function fetchConnectionTerms(
  type: string,
  credentials: ConnectionCredentials,
  scope: SchemaScope,
): Promise<SchemaTerm[]> {
  // ponytail: no cache layer of its own, so a schema Refresh is the terms'
  // Refresh too (#2514). A connector with its own `describeTerms` is read
  // uncached each time; give it a layer if one ever proves slow.
  return describeConnectionTerms(
    type,
    await driverConfig(credentials),
    () =>
      fetchConnectionSchema(
        type,
        credentials,
        scope,
      ) as Promise<DatabaseSchema>,
  );
}

/**
 * Fire-and-forget schema prefetch after connection save.
 * Errors are swallowed — schema is a cache; failure is non-critical.
 */
export function prefetchSchema(
  type: string,
  credentials: ConnectionCredentials,
  scope: IntrospectionScope,
): void {
  fetchConnectionSchema(type, credentials, { ...scope, refresh: true }).catch(
    () => {
      // Non-critical: schema prefetch failure should not surface to the user
    },
  );
}
