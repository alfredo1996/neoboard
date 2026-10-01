import { useMemo } from "react";
import { hashKey, useQuery } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";
import { unwrapFullResponse } from "@/lib/api/api-client";
import { trackConnectorOutcome } from "@/stores/connection-status-store";
import type { ParamSelectorOption } from "@neoboard/components";
import { seedRowToOption } from "@/lib/parameter/seed-option";

interface SeedQueryData {
  data: unknown;
}

/** A seed query key, hashed without `param_search` — the part a search changes. */
function hashWithoutSearch([
  scope,
  connectionId,
  query,
  params,
  tenantId,
  database,
]: QueryKey): string {
  const rest = { ...(params as Record<string, unknown> | undefined) };
  delete rest.param_search;
  return hashKey([scope, connectionId, query, rest, tenantId, database]);
}

/**
 * Fetches seed query options for select/multi-select/cascading widgets.
 * Returns an array of { label, value } pairs.
 * Named columns 'value' and 'label' take precedence over ordinal positions.
 *
 * Defense-in-depth: `tenantId` is passed in the request body and the server
 * asserts it matches the session tenant — complementing the existing
 * ownership check on the connection itself.
 *
 * `database` is the owning widget's saved per-card database: the options come
 * from where the widget runs, and a view-level request is matched on it
 * (#1824). Missing or "" sends none, for the connection's default.
 */
export function useSeedQuery(
  connectionId: string | undefined,
  query: string | undefined,
  enabled: boolean,
  extraParams?: Record<string, unknown>,
  tenantId?: string,
  database?: string,
): {
  options: ParamSelectorOption[];
  loading: boolean;
  error: Error | null;
  /** Re-run the seed query — the only recovery path after it fails (#1678). */
  refetch: () => void;
} {
  const queryKey = [
    "param-seed",
    connectionId,
    query,
    extraParams,
    tenantId,
    database,
  ];
  const { data, isLoading, error, refetch } = useQuery<SeedQueryData>({
    queryKey,
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          connectionId,
          query,
          params: extraParams ?? {},
          ...(tenantId ? { tenantId } : {}),
          ...(database ? { database } : {}),
        }),
      });
      // connectionId is non-empty whenever the query is enabled (see below).
      const { data: queryData } = await trackConnectorOutcome(
        connectionId!,
        unwrapFullResponse<SeedQueryData>(res),
      );
      return queryData;
    },
    enabled: enabled && !!connectionId && !!query,
    staleTime: 30_000, // 30 s — options don't change often
    // A dead connector must not be re-probed on every alt-tab (#1678).
    refetchOnWindowFocus: false,
    retry: false,
    // A new search term keeps the current options on screen while it loads:
    // `loading` swaps the selectors for a skeleton, and that unmount wiped the
    // text being typed (#1742). Anything else changing — a cascading parent
    // above all — starts empty, so the old parent's options can't linger (#1360).
    placeholderData: (previousData, previousQuery) =>
      previousQuery &&
      hashWithoutSearch(previousQuery.queryKey) === hashWithoutSearch(queryKey)
        ? previousData
        : undefined,
  });

  const options = useMemo((): ParamSelectorOption[] => {
    if (!data?.data) return [];
    return Array.isArray(data.data) ? data.data.map(seedRowToOption) : [];
  }, [data]);

  return { options, loading: isLoading, error: error ?? null, refetch };
}
