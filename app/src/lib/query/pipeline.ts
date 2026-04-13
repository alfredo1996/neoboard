import { extensions } from "@/lib/extensions";
import type {
  QueryContext,
  QueryMiddlewareExtension,
  QueryMiddlewareFn,
  QueryResult,
} from "./pipeline-types";

/**
 * Query middleware pipeline composer.
 *
 * Enterprise features (cache, audit, impersonation, rate limiting) register
 * middleware via `extensions.queryMiddleware`. At query time, `runPipeline`
 * sorts middleware by priority and composes them around the core executor
 * using a Koa-style `next()` pattern.
 *
 * When no middleware is registered — the community default — the pipeline
 * runs the core executor directly with zero measurable overhead.
 */

/** Default priority used when a middleware extension omits one. */
const DEFAULT_PRIORITY = 50;

/** Core executor signature — takes a context, returns a query result. */
export type QueryExecutor = (ctx: QueryContext) => Promise<QueryResult>;

/**
 * Compose a list of middleware around a core executor using `reduceRight`.
 * The first middleware in the array becomes the outermost wrapper.
 */
export function buildPipeline(
  middlewares: readonly QueryMiddlewareFn[],
  core: QueryExecutor,
): QueryExecutor {
  if (middlewares.length === 0) return core;

  // Fold from right so earlier middleware ends up as the outer layer.
  return middlewares.reduceRight<QueryExecutor>(
    (next, mw) => (ctx) => mw(ctx, () => next(ctx)),
    core,
  );
}

/**
 * Read middleware from the extension registry, sort by priority, compose
 * around the core executor, and run. This is the function routes call
 * instead of invoking the core executor directly.
 */
export async function runPipeline(
  ctx: QueryContext,
  core: QueryExecutor,
): Promise<QueryResult> {
  const registered = extensions.queryMiddleware.getAll();

  if (registered.length === 0) {
    // Hot path — no middleware, no sort, no compose.
    return core(ctx);
  }

  const sorted = [...registered].sort(
    (a: QueryMiddlewareExtension, b: QueryMiddlewareExtension) =>
      (a.priority ?? DEFAULT_PRIORITY) - (b.priority ?? DEFAULT_PRIORITY),
  );
  const fns = sorted.map((ext) => ext.middleware);
  return buildPipeline(fns, core)(ctx);
}
