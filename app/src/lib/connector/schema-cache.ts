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
  value: unknown;
}

// On globalThis: module state is per bundle in a Next production build, and
// the routes would each get their own cache (#1888).
const holder = globalThis as {
  __neoboardSchemaCache?: Map<string, Entry>;
  __neoboardSchemaInflight?: Map<string, Promise<unknown>>;
};
const cache = (holder.__neoboardSchemaCache ??= new Map<string, Entry>());
/** The read running per key: a miss or a refresh joins it instead of starting another (#2534). */
const inflight = (holder.__neoboardSchemaInflight ??= new Map<
  string,
  Promise<unknown>
>());

export interface IntrospectionScope {
  tenantId: string;
  connectionId: string;
  /** The stored, still-encrypted config: it keys the entry, so a changed one misses. */
  configEncrypted: string;
}

const SEP = "\u0000";
const prefix = (tenantId: string, connectionId: string) =>
  `${tenantId}${SEP}${connectionId}${SEP}`;

/**
 * Reads `load` once per tenant, connection and stored config for five
 * minutes; a miss or a `refresh` that finds a read already running joins it
 * rather than starting another (#2534), and a failure is not kept. A refresh
 * replaces the entry only when it succeeds, so a failed one leaves the last
 * good read. The key hashes the ciphertext, so no decrypted material feeds it
 * (a key rotation misses once).
 *
 * ponytail: a partially failed read (a per-type sample that resolved to `[]`)
 * is cached like a full one; the connector reports no failed part to act on.
 */
export function cachedIntrospection<T>(
  scope: IntrospectionScope,
  load: () => Promise<T>,
  options: { refresh?: boolean } = {},
): Promise<T> {
  const key =
    prefix(scope.tenantId, scope.connectionId) +
    createHash("sha256").update(scope.configEncrypted).digest("hex");
  const hit = cache.get(key);
  if (hit && !options.refresh && hit.expires > Date.now()) {
    // Re-inserted, so the first key in the map is the least recently used.
    cache.delete(key);
    cache.set(key, hit);
    return Promise.resolve(hit.value as T);
  }
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const promise: Promise<T> = load().then((value) => {
    // A connection forgotten meanwhile dropped this read: do not store it.
    if (inflight.get(key) === promise) {
      cache.delete(key);
      cache.set(key, { expires: Date.now() + SCHEMA_CACHE_TTL_MS, value });
      while (cache.size > SCHEMA_CACHE_MAX_ENTRIES) {
        cache.delete(cache.keys().next().value as string);
      }
    }
    return value;
  });
  inflight.set(key, promise);
  const done = () => {
    if (inflight.get(key) === promise) inflight.delete(key);
  };
  void promise.then(done, done);
  return promise;
}

/** Drops every entry of one connection: it was updated or deleted. */
export function forgetIntrospections(
  tenantId: string,
  connectionId: string,
): void {
  const p = prefix(tenantId, connectionId);
  // Deleting from a Map while iterating its keys is safe in JS.
  for (const key of cache.keys()) {
    if (key.startsWith(p)) cache.delete(key);
  }
  for (const key of inflight.keys()) {
    if (key.startsWith(p)) inflight.delete(key);
  }
}

export function resetSchemaCacheForTests(): void {
  cache.clear();
  inflight.clear();
}
