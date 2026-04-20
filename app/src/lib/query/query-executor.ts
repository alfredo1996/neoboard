import {
  createConnectionModule,
  DEFAULT_CONNECTION_CONFIG,
  ConnectionTypes,
} from "@/lib/connector/connection-adapter";
import { ensureDatabaseInUri, rewriteParamsForPostgres } from "./query-params";
import type { ConnectorType } from "@/lib/connector/connector-types";
import { QueryStatus } from "@neoboard/connection";

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

export type DbType = ConnectorType;

/** Numeric type for connection module config (legacy enum). */
function toConnectionTypeEnum(type: DbType): number {
  return type === "neo4j" ? ConnectionTypes.NEO4J : ConnectionTypes.POSTGRESQL;
}

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
  try {
    const m = mod as { close?: () => Promise<void> };
    if (typeof m.close === "function") {
      m.close().catch(() => {});
    }
  } catch {
    // best-effort cleanup
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

/** Visible for testing — returns current cache size. */
export function _getCacheSize(): number {
  return moduleCache.size;
}

function getCacheKey(type: DbType, credentials: ConnectionCredentials): string {
  const advancedKey = [
    credentials.connectionTimeout,
    credentials.queryTimeout,
    credentials.maxPoolSize,
    credentials.connectionAcquisitionTimeout,
    credentials.idleTimeout,
    credentials.statementTimeout,
    credentials.sslRejectUnauthorized,
    credentials.maxRows,
  ].join(",");
  return `${type}|${credentials.uri}|${credentials.username}|${credentials.database ?? ""}|${advancedKey}`;
}

function buildAdvancedOptions(credentials: ConnectionCredentials) {
  return {
    neo4jConnectionTimeout: credentials.connectionTimeout,
    neo4jQueryTimeout: credentials.queryTimeout,
    neo4jMaxPoolSize: credentials.maxPoolSize,
    neo4jAcquisitionTimeout: credentials.connectionAcquisitionTimeout,
    pgConnectionTimeoutMillis: credentials.connectionTimeout,
    pgIdleTimeoutMillis: credentials.idleTimeout,
    pgMaxPoolSize: credentials.maxPoolSize,
    pgStatementTimeout:
      credentials.statementTimeout ?? credentials.queryTimeout,
    pgSslRejectUnauthorized: credentials.sslRejectUnauthorized,
  };
}

function getOrCreateModule(
  type: DbType,
  credentials: ConnectionCredentials,
): unknown {
  const key = getCacheKey(type, credentials);
  const entry = moduleCache.get(key);
  if (entry) {
    entry.lastAccessedAt = Date.now();
    return entry.module;
  }

  const authConfig = {
    uri: ensureDatabaseInUri(credentials.uri, credentials.database),
    username: credentials.username,
    password: credentials.password,
    authType: 1, // NATIVE
  };
  const advancedOptions = buildAdvancedOptions(credentials);
  const connModule = createConnectionModule(type, authConfig, advancedOptions);
  moduleCache.set(key, { module: connModule, lastAccessedAt: Date.now() });
  startEvictionTimer();
  return connModule;
}

/**
 * Execute a query against a database connection.
 *
 * Returns the query result plus two pieces of driver-reported metadata:
 *
 *   - `truncated` — true when the driver returned fewer rows than the
 *     query produced because it hit the configured row limit. Surfaced
 *     via `setStatus(QueryStatus.COMPLETE_TRUNCATED)` from both the
 *     PostgreSQL and Neo4j connector modules.
 *   - `rowLimit` — the effective cap used for this query (either the
 *     connection's `maxRows` override or `DEFAULT_MAX_ROWS`). The API
 *     route echoes this back in `meta` so the UI banner can render the
 *     correct number.
 */
export async function executeQuery(
  type: DbType,
  credentials: ConnectionCredentials,
  queryParams: { query: string; params?: Record<string, unknown> },
  options?: { accessMode?: "READ" | "WRITE" },
): Promise<{
  data: unknown;
  fields?: unknown;
  truncated: boolean;
  rowLimit: number;
}> {
  const connModule = getOrCreateModule(type, credentials) as {
    runQuery: (
      params: unknown,
      callbacks: Record<string, unknown>,
      config: unknown,
    ) => void;
  };

  const effectiveRowLimit = credentials.maxRows ?? DEFAULT_MAX_ROWS;

  const config = {
    ...DEFAULT_CONNECTION_CONFIG,
    connectionType: toConnectionTypeEnum(type),
    database: credentials.database,
    rowLimit: effectiveRowLimit,
    ...(options?.accessMode ? { accessMode: options.accessMode } : {}),
    ...(credentials.queryTimeout ? { timeout: credentials.queryTimeout } : {}),
    ...(credentials.connectionTimeout
      ? { connectionTimeout: credentials.connectionTimeout }
      : {}),
  };

  // PostgreSQL uses positional $1, $2 params — rewrite $param_xxx tokens
  let finalQueryParams = queryParams;
  if (
    type === "postgresql" &&
    queryParams.params &&
    Object.keys(queryParams.params).length > 0
  ) {
    finalQueryParams = rewriteParamsForPostgres(
      queryParams.query,
      queryParams.params,
    );
  }

  return new Promise((resolve, reject) => {
    // Track truncation via setStatus — both connectors call
    // `callbacks.setStatus(COMPLETE_TRUNCATED)` when they hit the
    // rowLimit cap. Previously this callback was unimplemented and
    // the signal was silently dropped.
    let truncated = false;
    connModule.runQuery(
      finalQueryParams,
      {
        onSuccess: (result: unknown) =>
          resolve({
            data: result,
            truncated,
            rowLimit: effectiveRowLimit,
          }),
        onFail: (error: unknown) => reject(error),
        setFields: () => {},
        setSchema: () => {},
        setStatus: (status: QueryStatus) => {
          if (status === QueryStatus.COMPLETE_TRUNCATED) {
            truncated = true;
          }
        },
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
  const connModule = getOrCreateModule(type, credentials) as {
    checkConnection: (config: unknown) => Promise<boolean>;
  };

  const config = {
    ...DEFAULT_CONNECTION_CONFIG,
    connectionType: toConnectionTypeEnum(type),
    database: credentials.database,
  };

  return connModule.checkConnection(config);
}
