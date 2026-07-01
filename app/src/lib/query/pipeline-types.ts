/**
 * Execution context that flows through the middleware pipeline.
 *
 * Mutable by convention — middleware can rewrite `query`/`params`, stash
 * state in `metadata`, or record timings. The core executor receives the
 * final shape after all `pre` phase middleware has run.
 */
export interface QueryContext {
  query: string;
  params: Record<string, unknown>;
  connectionId: string;
  /** Connector type — any registry-registered type, not a fixed union (#1121). */
  connectionType: string;
  userId: string;
  tenantId: string;
  accessMode: "read" | "write";
  /** Scratch space for middleware (impersonation tags, cache keys, etc.). */
  metadata: Record<string, unknown>;
}

/**
 * Shape returned by the core query executor and propagated back up the
 * middleware chain. Mirrors the subset of the current `executeQuery` return
 * value that routes actually consume.
 */
export interface QueryResult {
  data: unknown;
  fields?: unknown;
  truncated?: boolean;
  rowLimit?: number;
}

/**
 * Koa-style middleware. Each middleware receives the context and a `next`
 * function that invokes the rest of the chain. Calling `next()` runs the
 * downstream middleware and (eventually) the core executor. Not calling
 * `next()` short-circuits the chain — useful for cache-hit short-circuits.
 */
export type QueryMiddlewareFn = (
  ctx: QueryContext,
  next: () => Promise<QueryResult>,
) => Promise<QueryResult>;

/**
 * Extension shape registered via `extensions.queryMiddleware`. Priority
 * controls ordering — lower priorities run first, so a cache lookup
 * middleware (priority: 5) wraps an audit middleware (priority: 50).
 */
export interface QueryMiddlewareExtension {
  readonly id: string;
  readonly priority?: number;
  readonly middleware: QueryMiddlewareFn;
}
