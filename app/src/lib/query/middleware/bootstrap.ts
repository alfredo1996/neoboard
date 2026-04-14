import { extensions } from "@/lib/extensions";
import { auditMiddleware } from "./audit";
import { schedulerMiddleware } from "./scheduler";

/**
 * Register built-in query middleware with the extensions registry.
 *
 * These are core middleware that ship with the community edition —
 * distinct from the enterprise middleware that `bootstrapExtensions()`
 * loads from `@neoboard/enterprise`.
 *
 * Call order:
 *   1. This function runs first → registers core middleware
 *      (scheduler, audit, ...)
 *   2. bootstrapExtensions() runs next → enterprise middleware stacks
 *      around core (cache, impersonation, rate limit)
 *
 * Priority layout (lower = runs earlier = outer wrapper):
 *   -  1-9 : reserved for cache (enterprise)
 *   - 10-19: reserved for impersonation / SET ROLE (enterprise)
 *   - 20-29: reserved for rate limiting (enterprise, token bucket)
 *   -    30: scheduler (this core middleware) — queue-based concurrency
 *   - 31-49: reserved for future core middleware
 *   -    50: audit (logs every executed query)
 *
 * Idempotent — calling twice is a no-op.
 */

let bootstrapped = false;

export function bootstrapQueryMiddleware(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  extensions.queryMiddleware.register({
    id: "core:scheduler",
    priority: 30,
    middleware: schedulerMiddleware,
  });

  extensions.queryMiddleware.register({
    id: "core:audit",
    priority: 50,
    middleware: auditMiddleware,
  });
}

/** Test helper — resets the idempotency guard so tests can call again. */
export function _resetQueryMiddlewareBootstrap(): void {
  bootstrapped = false;
}
