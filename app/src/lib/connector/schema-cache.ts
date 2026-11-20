import { createHash } from "node:crypto";

/**
 * Server-side introspection cache (#2514), shared by the schema route, the
 * ontology routes and the concept checks, so one connection is read once
 * where the editor, the Model page and every save each read it again.
 *
 * ponytail: per process. With several replicas each holds its own copy until a
 * shared store exists (#2442); the TTL bounds how stale any copy can be.
 */
export const SCHEMA_CACHE_TTL_MS = 5 * 60 * 1000;
export const SCHEMA_CACHE_MAX_ENTRIES = 100;

interface Entry {
  expires: number;
  promise: Promise<unknown>;
}

// On globalThis: module state is per bundle in a Next production build, and
// the routes would each get their own cache (#1888).
const holder = globalThis as { __neoboardSchemaCache?: Map<string, Entry> };
const cache = (holder.__neoboardSchemaCache ??= new Map<string, Entry>());

export interface IntrospectionScope {
  tenantId: string;
  connectionId: string;
}

const SEP = "\u0000";
const prefix = (tenantId: string, connectionId: string) =>
  `${tenantId}${SEP}${connectionId}${SEP}`;

/**
 * The connection's config as a hash: a changed connection misses, and the
 * decrypted config is neither stored nor logged.
 */
const hashConfig = (config: unknown) =>
  createHash("sha256").update(JSON.stringify(config)).digest("hex");

/**
 * Reads `load` once per tenant, connection and config for five minutes;
 * concurrent misses share one read, a failure is not kept, and `refresh`
 * reads again and replaces the entry.
 */
export function cachedIntrospection<T>(
  scope: IntrospectionScope,
  config: unknown,
  kind: string,
  load: () => Promise<T>,
  options: { refresh?: boolean } = {},
): Promise<T> {
  const key = `${prefix(scope.tenantId, scope.connectionId)}${hashConfig(config)}${SEP}${kind}`;
  const hit = cache.get(key);
  if (hit && !options.refresh && hit.expires > Date.now()) {
    return hit.promise as Promise<T>;
  }
  const promise = load();
  const entry: Entry = { expires: Date.now() + SCHEMA_CACHE_TTL_MS, promise };
  // Re-inserted, so the oldest key is always the first one in the map.
  cache.delete(key);
  cache.set(key, entry);
  while (cache.size > SCHEMA_CACHE_MAX_ENTRIES) {
    cache.delete(cache.keys().next().value as string);
  }
  promise.catch(() => {
    if (cache.get(key) === entry) cache.delete(key);
  });
  return promise;
}

/** Drops every entry of one connection: it was updated or deleted. */
export function forgetIntrospections(
  tenantId: string,
  connectionId: string,
): void {
  const p = prefix(tenantId, connectionId);
  for (const key of [...cache.keys()]) {
    if (key.startsWith(p)) cache.delete(key);
  }
}

export function resetSchemaCacheForTests(): void {
  cache.clear();
}
