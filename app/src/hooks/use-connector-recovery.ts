"use client";

import { useEffect } from "react";
import {
  focusManager,
  useQueryClient,
  type Query,
  type QueryClient,
} from "@tanstack/react-query";
import { useConnectionStatusStore } from "@/stores/connection-status-store";
import { DEAD_CONNECTOR_TTL_MS } from "@/lib/connector/connection-error-classifier";

/** How often a flagged connection is checked for a probe that is due. */
export const PROBE_CHECK_MS = 1_000;

/** The cache scopes of `useWidgetQuery` and `useSeedQuery`. */
const SCOPES: ReadonlySet<unknown> = new Set(["widget-query", "param-seed"]);

/** A widget or selector query on this connection. */
function on(connectionId: string) {
  return ({ queryKey }: Query) =>
    SCOPES.has(queryKey[0]) && queryKey[1] === connectionId;
}

/**
 * One of those that failed and is not running. An in-flight one is excluded:
 * it is a probe already, and the query whose success just cleared the flag is
 * still in flight when that happens.
 */
function parkedOn(connectionId: string) {
  const isOn = on(connectionId);
  return (query: Query) =>
    isOn(query) &&
    query.state.status === "error" &&
    query.state.fetchStatus === "idle";
}

/**
 * Re-run ONE parked query per flagged connection: N widgets on a dead
 * connector must not become N requests (#1888). It goes out a full TTL after
 * the connection last failed here, because the server's memo runs a TTL from
 * each failed dial: timed off anything earlier, a probe only replays it. None
 * goes out while a query on the connection is still running, since its answer
 * is the probe, nor while the tab is hidden, as TanStack's own refetch
 * interval is.
 */
function probeDue(queryClient: QueryClient) {
  if (!focusManager.isFocused()) return;
  const cache = queryClient.getQueryCache();
  const { statuses } = useConnectionStatusStore.getState();
  for (const [id, status] of Object.entries(statuses)) {
    if (status !== "error") continue;
    const queries = cache.findAll({ predicate: on(id) });
    if (queries.some((q) => q.state.fetchStatus !== "idle")) continue;
    const lastFailure = Math.max(
      0,
      ...queries.map((q) => q.state.errorUpdatedAt),
    );
    if (Date.now() - lastFailure < DEAD_CONNECTOR_TTL_MS) continue;
    const probe = queries.find(
      (q) => q.isActive() && q.state.status === "error",
    );
    if (probe) {
      void queryClient.refetchQueries({
        queryKey: probe.queryKey,
        exact: true,
      });
    }
  }
}

/**
 * An open dashboard heals by itself once a dead connector answers again
 * (#2167). Nothing retries a `ConnectorUnavailableError` on its own (#1678),
 * so without this the page stayed "Connector unavailable" until someone
 * clicked Retry, reloaded, or ran a Test.
 *
 * While any connection is flagged, one parked query per flagged connection is
 * re-run a `DEAD_CONNECTOR_TTL_MS` after its last failure: sooner only replays
 * the server's memo.
 * The moment a flag clears, by this probe, a refresh cycle or a Retry, every
 * parked widget and selector on that connection re-runs. Mount once per
 * dashboard, never per card.
 */
export function useConnectorRecovery(): void {
  const queryClient = useQueryClient();
  const anyFlagged = useConnectionStatusStore((s) =>
    Object.values(s.statuses).includes("error"),
  );

  useEffect(() => {
    if (!anyFlagged) return;
    // ponytail: one cheap cache scan a second, not a timer per connection
    // re-armed on every settle: the cache already holds each last failure.
    const timer = setInterval(() => probeDue(queryClient), PROBE_CHECK_MS);
    return () => clearInterval(timer);
  }, [anyFlagged, queryClient]);

  useEffect(
    () =>
      useConnectionStatusStore.subscribe(({ statuses }, prev) => {
        for (const [id, status] of Object.entries(prev.statuses)) {
          if (status === "error" && statuses[id] === "connected") {
            void queryClient.invalidateQueries({ predicate: parkedOn(id) });
          }
        }
      }),
    [queryClient],
  );
}
