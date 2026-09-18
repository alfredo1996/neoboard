import { connectorUnavailableReason } from "@/lib/connector/connection-error-classifier";
import type { QueryMiddlewareFn } from "@/lib/query/pipeline-types";

/**
 * Remembers a connector nobody can reach, so the next query fails at once
 * instead of dialling again (#1888).
 *
 * A host that drops packets costs every query the full connect timeout. The
 * client-side flag (#1678) only spares the siblings of the first failure, in
 * one tab: every reload, every other user and every refresh cycle paid the
 * wait again. Here the first failure is replayed for a short TTL, which also
 * keeps a dead connector from pinning scheduler slots — this runs outside it.
 *
 * Only what `handleRouteError` maps to CONNECTOR_UNAVAILABLE is remembered, by
 * the same classifier. An error the database itself returned proves the
 * connector answered.
 *
 * ponytail: in-memory and per-process. Each replica learns on its own first
 * failure; move it to a shared store if that ever costs more than one timeout
 * per replica per TTL.
 */
export const DEAD_CONNECTOR_TTL_MS = 30_000;

type DeadConnectors = Map<string, { error: unknown; until: number }>;

// On globalThis for the reason the extensions registry is: the middleware is
// registered from instrumentation's bundle and forgetDeadConnector is called
// from a route's, and each bundle gets its own copy of this module.
const globalMemo = globalThis as typeof globalThis & {
  __neoboardDeadConnectors?: DeadConnectors;
};
const dead = (globalMemo.__neoboardDeadConnectors ??= new Map());

const keyOf = (tenantId: string, connectionId: string) =>
  `${tenantId}:${connectionId}`;

export const deadConnectorMiddleware: QueryMiddlewareFn = async (ctx, next) => {
  const key = keyOf(ctx.tenantId, ctx.connectionId);
  const known = dead.get(key);
  if (known) {
    if (Date.now() < known.until) throw known.error;
    dead.delete(key);
  }
  try {
    return await next();
  } catch (error) {
    if (connectorUnavailableReason(error)) {
      dead.set(key, { error, until: Date.now() + DEAD_CONNECTOR_TTL_MS });
    }
    throw error;
  }
};

/** A connection test succeeded, or the connection changed: dial again. */
export function forgetDeadConnector(
  tenantId: string,
  connectionId: string,
): void {
  dead.delete(keyOf(tenantId, connectionId));
}

/** Test helper. */
export function resetDeadConnectors(): void {
  dead.clear();
}
