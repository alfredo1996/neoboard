import { extensions } from "@/lib/extensions";
import { auditMiddleware } from "./audit";

/**
 * Register built-in query middleware with the extensions registry.
 *
 * These are core middleware that ship with the community edition —
 * distinct from the enterprise middleware that `bootstrapExtensions()`
 * loads from `@neoboard/enterprise`.
 *
 * Call order:
 *   1. This function runs first → registers core middleware (audit, ...)
 *   2. bootstrapExtensions() runs next → enterprise middleware stacks
 *      on top (cache, impersonation, rate limit)
 *
 * Priorities leave room for enterprise middleware on both sides:
 *   - 1-9    : reserved for cache (enterprise)
 *   - 10-19  : reserved for impersonation / SET ROLE (enterprise)
 *   - 20-29  : reserved for rate limit (enterprise)
 *   - 50     : audit (this middleware) — wraps everything below
 *
 * Idempotent — calling twice is a no-op.
 */

let bootstrapped = false;

export function bootstrapQueryMiddleware(): void {
  if (bootstrapped) return;
  bootstrapped = true;

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
