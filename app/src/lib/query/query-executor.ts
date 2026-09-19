import {
  createConnectionModule,
  DEFAULT_CONNECTION_CONFIG,
  toConnectorError,
} from "@/lib/connector/connection-adapter";
import { QueryStatus } from "@neoboard/connection";
import { createHash } from "node:crypto";

import { resolveContainerHost } from "@/lib/connector/container-host";
/**
 * Default row cap applied to read queries when a connection doesn't
 * specify its own `maxRows`. Matches the connection package's own
 * `DEFAULT_CONNECTION_CONFIG.rowLimit` value (5000). Exported so the
 * API route can echo the effective cap back to the client and the UI
 * banner can render the right number.
 */
export const DEFAULT_MAX_ROWS = 5000;

export interface ConnectionCredentials {
  uri: string;
  username: string;
  password: string;
  database?: string;
  // Advanced pool/timeout settings (optional)
  connectionTimeout?: number;
  queryTimeout?: number;
  maxPoolSize?: number;
  connectionAcquisitionTimeout?: number;
  idleTimeout?: number;
  statementTimeout?: number;
  sslRejectUnauthorized?: boolean;
  /**
   * Max rows returned per read query on this connection. When unset,
   * DEFAULT_MAX_ROWS is used. Queries returning more than this many rows
   * are silently truncated by the driver; the API response carries a
   * `truncated: true` flag in meta so the UI can render a banner.
   */
  maxRows?: number;
}

// Registry-supplied connectors are first-class (#1121): a connector type is
// any registered string. createConnectionModule resolves it via the registry,
// and nothing below compares it to anything — parameter style and timeout
// precedence are each connector's own business (#1898).
export type DbType = string;

/**
 * TTL-based connection module cache. Each entry tracks last-access time
 * and is evicted after `CACHE_TTL_MS` of inactivity. This prevents
 * leaking driver instances on long-running servers when credentials
 * rotate or connections are deleted.
 */
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const EVICTION_INTERVAL_MS = 5 * 60 * 1000; // sweep every 5 minutes

interface CacheEntry {
  module: unknown;
  lastAccessedAt: number;
}

const moduleCache = new Map<string, CacheEntry>();

let evictionTimer: ReturnType<typeof setInterval> | null = null;

function startEvictionTimer() {
  if (evictionTimer) return;
  const timer = setInterval(() => _evictStaleEntries(), EVICTION_INTERVAL_MS);
  // unref() exists on Node's Timeout but not in all runtimes. When
  // available, prevents the timer from keeping the process alive.
  (timer as { unref?: () => void }).unref?.();
  evictionTimer = timer;
}

/** Visible for testing. Sweeps the cache and evicts stale entries. */
export function _evictStaleEntries() {
  const now = Date.now();
  for (const [key, entry] of moduleCache) {
    if (now - entry.lastAccessedAt > CACHE_TTL_MS) {
      closeModuleSilently(entry.module);
      moduleCache.delete(key);
    }
  }
  if (moduleCache.size === 0 && evictionTimer) {
    clearInterval(evictionTimer);
    evictionTimer = null;
  }
}

function closeModuleSilently(mod: unknown) {
  const m = mod as { close?: () => Promise<void> };
  if (typeof m.close === "function") {
    m.close().catch(() => {});
  }
}

/**
 * Close and remove a cached connection module by its cache key.
 * Called when a connection's credentials change or the connection is deleted.
 */
export function closeConnection(
  type: DbType,
  credentials: ConnectionCredentials,
): void {
  const key = getCacheKey(type, credentials);
  const entry = moduleCache.get(key);
  if (entry) {
    closeModuleSilently(entry.module);
    moduleCache.delete(key);
  }
}

/**
 * Close all cached connection modules. Used in tests and graceful shutdown.
 */
export async function closeAllConnections(): Promise<void> {
  const closePromises: Promise<void>[] = [];
  for (const [, entry] of moduleCache) {
    const m = entry.module as { close?: () => Promise<void> };
    if (typeof m.close === "function") {
      closePromises.push(m.close().catch(() => {}));
    }
  }
  moduleCache.clear();
  if (evictionTimer) {
    clearInterval(evictionTimer);
    evictionTimer = null;
  }
  await Promise.all(closePromises);
}

/** Visible for testing — the live cache keys, to assert no secret leaks in. */
export function _getCacheKeysForTesting(): string[] {
  return [...moduleCache.keys()];
}

/** Visible for testing — returns current cache size. */
export function _getCacheSize(): number {
  return moduleCache.size;
}

/**
 * JSON with object keys sorted at every depth, so two bags with the same
 * content serialize the same whatever order they were built in. `undefined`
 * values are dropped, as JSON.stringify drops them: a config read back from
 * storage never carries one.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

/**
 * Cache key: the connector type plus a SHA-256 of the WHOLE config bag.
 *
 * The key used to enumerate the eight options the app knew about, so an option
 * it did not know — any option of a registry-supplied connector — was not part
 * of it, and two connections differing only there silently shared one driver
 * (#1897). Before that it omitted the password, and a WRONG password still got
 * the pool a right one had authenticated (#1300). Hashing everything closes the
 * class instead of the instance.
 *
 * A digest, never the values: cache keys reach diagnostics and error paths,
 * and nothing in the bag may be recoverable from one. The serialized bag is
 * the hash input and nothing else — NEVER log it.
 */
function getCacheKey(type: DbType, credentials: ConnectionCredentials): string {
  const digest = createHash("sha256")
    .update(stableStringify(credentials))
    .digest("hex");
  return `${type}|${digest}`;
}

async function getOrCreateModule(
  type: DbType,
  credentials: ConnectionCredentials,
): Promise<unknown> {
  const key = getCacheKey(type, credentials);
  const entry = moduleCache.get(key);
  if (entry) {
    entry.lastAccessedAt = Date.now();
    return entry.module;
  }

  // The decrypted config passes through as ONE bag: the connector builds its
  // own auth, reads its own option keys and applies `database` itself, so the
  // app knows none of them (#1897). The one thing done to it here is
  // deployment logic, not connector logic — from inside a container
  // `localhost` is the container, so a loopback URI can never reach the user's
  // database. The stored connection keeps what they typed; only the driver
  // sees the rewrite (#1346).
  const config: Record<string, unknown> = { ...credentials };
  if (typeof config.uri === "string") {
    config.uri = await resolveContainerHost(config.uri);
  }
  const connModule = createConnectionModule(type, config);
  moduleCache.set(key, { module: connModule, lastAccessedAt: Date.now() });
  startEvictionTimer();
  return connModule;
}

/** Access mode as the connection library's config expects it (uppercase). */
export type ConnectorAccessMode = "READ" | "WRITE";

/**
 * Map the pipeline's lowercase access mode (`QueryContext.accessMode`) to the
 * connector library's uppercase one. The single source of truth so the route's
 * intent actually reaches the connector — previously the route set a lowercase
 * value that was never consumed, and read-only enforcement rode entirely on
 * `DEFAULT_CONNECTION_CONFIG.accessMode` (#1044).
 */
export function toConnectorAccessMode(
  mode: "read" | "write",
): ConnectorAccessMode {
  return mode === "write" ? "WRITE" : "READ";
}

/**
 * Execute a query against a database connection.
 *
 * Returns the query result plus two pieces of driver-reported metadata:
 *
 *   - `truncated` — true when the driver returned fewer rows than the
 *     query produced because it hit the configured row limit. Surfaced
 *     via `setStatus(QueryStatus.COMPLETE_TRUNCATED)` from every
 *     connector module.
 *   - `rowLimit` — the effective cap used for this query (either the
 *     connection's `maxRows` override or `DEFAULT_MAX_ROWS`). The API
 *     route echoes this back in `meta` so the UI banner can render the
 *     correct number.
 *
 * `options.rowLimit` lowers that cap for one query (the editor preview asks
 * for 25, #1896). It is clamped HERE, where every caller passes through: a
 * request can ask for fewer rows than the connection allows, never more. The
 * query text is never touched — the connector stops pulling rows at the cap.
 *
 * `queryParams` reaches the connector exactly as given: the text as written
 * and the NAMED parameter map. How a name gets to the driver is the
 * connector's business (#1898).
 *
 * `options.timeout` is an explicit per-query override. Left out — as every
 * caller does today — `config.timeout` stays unset and the connector resolves
 * its own default from the timeout field it declares, falling back to
 * DEFAULT_CONNECTION_CONFIG.timeout (30s). Either way the bound is enforced at
 * the driver/transaction level, never here.
 */
export async function executeQuery(
  type: DbType,
  credentials: ConnectionCredentials,
  queryParams: { query: string; params?: Record<string, unknown> },
  options?: {
    accessMode?: ConnectorAccessMode;
    rowLimit?: number;
    timeout?: number;
  },
): Promise<{
  data: unknown;
  fields?: unknown;
  truncated: boolean;
  rowLimit: number;
}> {
  const connModule = (await getOrCreateModule(type, credentials)) as {
    runQuery: (
      params: unknown,
      callbacks: Record<string, unknown>,
      config: unknown,
    ) => void;
  };

  const maxRows = credentials.maxRows ?? DEFAULT_MAX_ROWS;
  const effectiveRowLimit = Math.min(options?.rowLimit ?? maxRows, maxRows);

  const config = {
    ...DEFAULT_CONNECTION_CONFIG,
    database: credentials.database,
    rowLimit: effectiveRowLimit,
    ...(options?.accessMode ? { accessMode: options.accessMode } : {}),
    // Overwrites the spread's 30s on purpose: a default passed from here would
    // outrank the connector's own configured timeout (#1898).
    timeout: options?.timeout,
    ...(credentials.connectionTimeout
      ? { connectionTimeout: credentials.connectionTimeout }
      : {}),
  };

  return new Promise((resolve, reject) => {
    // Track truncation via setStatus — both connectors call
    // `callbacks.setStatus(COMPLETE_TRUNCATED)` when they hit the
    // rowLimit cap. Previously this callback was unimplemented and
    // the signal was silently dropped.
    let truncated = false;
    const inFlight = connModule.runQuery(
      queryParams,
      {
        onSuccess: (result: unknown) =>
          resolve({
            data: result,
            truncated,
            rowLimit: effectiveRowLimit,
          }),
        // Classified by the connector that raised it (#1903): the routes
        // read that verdict and recognise no driver's words themselves. A
        // no-op for the built-ins, which wrap at the point of failure; it is
        // what makes a connector that hands over a raw error work the same.
        onFail: (error: unknown) => reject(toConnectorError(type, error)),
        setStatus: (status: QueryStatus) => {
          if (status === QueryStatus.COMPLETE_TRUNCATED) {
            truncated = true;
          }
        },
      },
      config,
    );
    // runQuery rejects only when the consumer's own onSuccess throws (#1642).
    // The onSuccess above is a bare resolve() and cannot, so this is a
    // backstop — but without it a rejection would leave this promise pending
    // forever and pin a scheduler slot. Promise.resolve() tolerates a stub
    // that returns nothing.
    Promise.resolve(inFlight).catch(reject);
  });
}

/**
 * Test a database connection.
 */
export async function testConnection(
  type: DbType,
  credentials: ConnectionCredentials,
): Promise<boolean> {
  const config = {
    ...DEFAULT_CONNECTION_CONFIG,
    database: credentials.database,
  };

  try {
    const connModule = (await getOrCreateModule(type, credentials)) as {
      checkConnection: (config: unknown) => Promise<boolean>;
    };
    return await connModule.checkConnection(config);
  } catch (error) {
    // Building the module is inside the try: a connector rejects a bad URI in
    // its constructor, and the Test result has to say so (#1903).
    throw toConnectorError(type, error);
  }
}

/**
 * List available databases on the connection server.
 * Returns an empty array if the operation is unsupported or fails.
 */
export async function listDatabases(
  type: DbType,
  credentials: ConnectionCredentials,
): Promise<string[]> {
  const connModule = (await getOrCreateModule(type, credentials)) as {
    listDatabases: () => Promise<string[]>;
  };
  return connModule.listDatabases();
}

/**
 * List available schemas in the current database.
 * Returns an empty array if the connector does not support it or it fails.
 */
export async function listSchemas(
  type: DbType,
  credentials: ConnectionCredentials,
): Promise<string[]> {
  const connModule = (await getOrCreateModule(type, credentials)) as {
    listSchemas?: () => Promise<string[]>;
  };
  if (typeof connModule.listSchemas !== "function") return [];
  return connModule.listSchemas();
}
