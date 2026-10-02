import {
  createConnectionModule,
  DEFAULT_CONNECTION_CONFIG,
  getConnector,
  toConnectorError,
} from "@/lib/connector/connection-adapter";
import {
  ConnectorError,
  ConnectorErrorType,
  QueryStatus,
  type ConnectorConfig,
} from "@neoboard/connection";
import { createHash } from "node:crypto";

import { driverConfig } from "@/lib/connector/container-host";
import { stableStringify } from "@/lib/stable-stringify";
/**
 * Default row cap applied to read queries when a connection doesn't
 * specify its own `maxRows`. Matches the connection package's own
 * `DEFAULT_CONNECTION_CONFIG.rowLimit` value (5000). Exported so the
 * API route can echo the effective cap back to the client and the UI
 * banner can render the right number.
 */
export const DEFAULT_MAX_ROWS = 5000;

/**
 * A stored connection config, decrypted: the connector's own bag — its keys
 * are declared by its descriptor and validated against it on save (#1901), so
 * none is spelled out here — plus the one key the app owns.
 */
export type ConnectionCredentials = ConnectorConfig & {
  /**
   * Max rows returned per read query on this connection. When unset,
   * DEFAULT_MAX_ROWS is used. Queries returning more than this many rows
   * are silently truncated by the driver; the API response carries a
   * `truncated: true` flag in meta so the UI can render a banner.
   */
  maxRows?: number;
};

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
  /** Calls running on the module: it is never closed under one. */
  users: number;
  /** Out of the cache, to be closed once its last call settles. */
  retired: boolean;
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
      retire(entry);
      moduleCache.delete(key);
    }
  }
  if (moduleCache.size === 0 && evictionTimer) {
    clearInterval(evictionTimer);
    evictionTimer = null;
  }
}

/**
 * Close the module now, or once the last call running on it settles.
 * Connections with the same settings share one module, so deleting one closed
 * the driver under another's running query, which then waited on the closed
 * pool until a timeout (#2171).
 */
function retire(entry: CacheEntry) {
  entry.retired = true;
  if (entry.users === 0) closeModuleSilently(entry.module);
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
    retire(entry);
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

async function getOrCreateEntry(
  type: DbType,
  credentials: ConnectionCredentials,
): Promise<CacheEntry> {
  const key = getCacheKey(type, credentials);
  const cached = moduleCache.get(key);
  if (cached) {
    cached.lastAccessedAt = Date.now();
    return cached;
  }

  // The decrypted config passes through as ONE bag: the connector builds its
  // own auth, reads its own option keys and applies `database` itself, so the
  // app knows none of them (#1897). The one thing done to it here is
  // deployment logic, not connector logic — from inside a container
  // `localhost` is the container, so a loopback URI can never reach the user's
  // database. The stored connection keeps what they typed; only the driver
  // sees the rewrite (#1346).
  const connModule = createConnectionModule(
    type,
    await driverConfig(credentials),
  );
  const entry: CacheEntry = {
    module: connModule,
    lastAccessedAt: Date.now(),
    users: 0,
    retired: false,
  };
  moduleCache.set(key, entry);
  startEvictionTimer();
  return entry;
}

/** Run `work` on the cached module, which stays open until `work` settles. */
async function withModule<M, T>(
  type: DbType,
  credentials: ConnectionCredentials,
  work: (module: M) => Promise<T>,
): Promise<T> {
  const entry = await getOrCreateEntry(type, credentials);
  entry.users++;
  try {
    return await work(entry.module as M);
  } finally {
    entry.users--;
    if (entry.retired) retire(entry);
  }
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
 * How long past the query's timeout the executor waits for a connector before
 * failing the query itself (#2060). A connector's timeout bounds its
 * statement, not the connection it opens first, so the connector gets room
 * to answer with its own verdict first: a default connect or pool timeout
 * that sits a few seconds above the query timeout still lands inside this.
 *
 * ponytail: one fixed grace. A connector whose setup outlasts every duration
 * it declares plus 10 s is failed early; make it a QUERY_* variable if one does.
 */
export const QUERY_DEADLINE_GRACE_MS = 10_000;

/** setTimeout's ceiling: past it, Node fires the timer after 1 ms. */
const MAX_TIMER_MS = 2 ** 31 - 1;

const isDuration = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * The longest this query can legitimately run, before the grace: an explicit
 * per-query timeout, or any millisecond duration the connection holds for a
 * field its connector declares with `unit: "ms"`, and never less than the
 * default. Which of those fields is the query timeout is the connector's
 * business (#1898), so the app takes the longest: a backstop may be late,
 * never early.
 */
function queryDeadlineMs(
  type: DbType,
  credentials: ConnectionCredentials,
  override?: number,
): number {
  const declared = (getConnector(type)?.fields ?? [])
    .filter((field) => field.unit === "ms")
    .map((field) => credentials[field.key]);
  const longest = Math.max(
    DEFAULT_CONNECTION_CONFIG.timeout,
    ...[override, ...declared].filter(isDuration),
  );
  // A field without a `max` accepts any duration; unclamped, one past the
  // ceiling would fail every query on the connection at once.
  return Math.min(longest + QUERY_DEADLINE_GRACE_MS, MAX_TIMER_MS);
}

/**
 * Fails the work with a TIMEOUT once `ms` pass. Not transient, unlike a
 * connector's own timeout: the client retries transient errors, and every
 * retry of a connector that never answers pins a slot for the whole deadline
 * again (#1678).
 */
function armDeadline(ms: number, fail: (error: ConnectorError) => void) {
  return setTimeout(
    () =>
      fail(
        new ConnectorError(`The connector did not answer within ${ms} ms`, {
          type: ConnectorErrorType.TIMEOUT,
          transient: false,
        }),
      ),
    ms,
  );
}

/** `work`, failed with the same TIMEOUT once `ms` pass. */
async function withinDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        deadline = armDeadline(ms, reject);
      }),
    ]);
  } finally {
    clearTimeout(deadline);
  }
}

/**
 * A result longer than the cap, cut to it and marked truncated, as a
 * compliant connector reports it (#2060). The query is never touched: this
 * acts on what came back. A list within the cap, or a result that is not a
 * list, is returned as the connector gave it.
 */
function capRows(
  result: unknown,
  rowLimit: number,
  reported: boolean,
): { data: unknown; truncated: boolean } {
  if (Array.isArray(result) && result.length > rowLimit) {
    return { data: result.slice(0, rowLimit), truncated: true };
  }
  return { data: result, truncated: reported };
}

type QueryModule = {
  runQuery: (
    params: unknown,
    callbacks: Record<string, unknown>,
    config: unknown,
  ) => void;
};

/**
 * Execute a query against a database connection.
 *
 * Returns the query result plus two pieces of driver-reported metadata:
 *
 *   - `truncated` — true when the driver returned fewer rows than the
 *     query produced because it hit the configured row limit. Surfaced
 *     via `setStatus(QueryStatus.COMPLETE_TRUNCATED)` from every
 *     connector module. A connector that hands back more rows than the cap
 *     anyway is cut to it here, and the result is marked truncated.
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
 * the driver/transaction level. The executor only backstops it: a connector
 * that has not called `onSuccess` or `onFail` by `queryDeadlineMs` is failed
 * with a TIMEOUT, which frees its scheduler slot, and whatever it says after
 * that is ignored (#2060).
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
  truncated: boolean;
  rowLimit: number;
}> {
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

  const deadlineMs = queryDeadlineMs(type, credentials, options?.timeout);

  return withModule(
    type,
    credentials,
    (connModule: QueryModule) =>
      new Promise((resolve, reject) => {
        // Armed before runQuery, which may call back synchronously. Once it
        // fires the promise has settled, so a late callback changes nothing.
        const deadline = armDeadline(deadlineMs, reject);
        const settle =
          <V>(done: (value: V) => void) =>
          (value: V) => {
            clearTimeout(deadline);
            done(value);
          };
        const succeed = settle(resolve);
        const fail = settle(reject);

        // Track truncation via setStatus — both connectors call
        // `callbacks.setStatus(COMPLETE_TRUNCATED)` when they hit the
        // rowLimit cap. Previously this callback was unimplemented and
        // the signal was silently dropped.
        let truncated = false;
        const inFlight = connModule.runQuery(
          queryParams,
          {
            onSuccess: (result: unknown) =>
              succeed({
                ...capRows(result, effectiveRowLimit, truncated),
                rowLimit: effectiveRowLimit,
              }),
            // Classified by the connector that raised it (#1903): the routes
            // read that verdict and recognise no driver's words themselves. A
            // no-op for the built-ins, which wrap at the point of failure; it is
            // what makes a connector that hands over a raw error work the same.
            onFail: (error: unknown) => fail(toConnectorError(type, error)),
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
        Promise.resolve(inFlight).catch(fail);
      }),
  );
}

/**
 * Test a database connection. The probe holds a scheduler slot like a query
 * (#1426), so it gets the same deadline: a `checkConnection` that never
 * settles fails with the same TIMEOUT instead of pinning the slot (#2060).
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
    return await withModule(
      type,
      credentials,
      (connModule: {
        checkConnection: (config: unknown) => Promise<boolean>;
      }) =>
        withinDeadline(
          connModule.checkConnection(config),
          queryDeadlineMs(type, credentials),
        ),
    );
  } catch (error) {
    // Building the module is inside the try: a connector rejects a bad URI in
    // its constructor, and the Test result has to say so (#1903).
    throw toConnectorError(type, error);
  }
}

/**
 * List available databases on the connection server. Bounded by the query
 * deadline like the probe: a list that never settled would hold a deleted
 * connection's driver open for good (#2171).
 */
export async function listDatabases(
  type: DbType,
  credentials: ConnectionCredentials,
): Promise<string[]> {
  return withModule(
    type,
    credentials,
    (connModule: { listDatabases: () => Promise<string[]> }) =>
      withinDeadline(
        connModule.listDatabases(),
        queryDeadlineMs(type, credentials),
      ),
  );
}

/**
 * List available schemas in the current database, under the same deadline.
 * Returns an empty array if the connector does not support it.
 */
export async function listSchemas(
  type: DbType,
  credentials: ConnectionCredentials,
): Promise<string[]> {
  return withModule(
    type,
    credentials,
    (connModule: { listSchemas?: () => Promise<string[]> }) =>
      withinDeadline(
        Promise.resolve(connModule.listSchemas?.() ?? []),
        queryDeadlineMs(type, credentials),
      ),
  );
}
