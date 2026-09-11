import { useMemo } from "react";
import { hashKey, useQuery } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";
import { unwrapFullResponse } from "@/lib/api/api-client";
import { trackConnectorOutcome } from "@/stores/connection-status-store";
import type { ParamSelectorOption } from "@neoboard/components";

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
]: QueryKey): string {
  const rest = { ...(params as Record<string, unknown> | undefined) };
  delete rest.param_search;
  return hashKey([scope, connectionId, query, rest, tenantId]);
}

/**
 * Fetches seed query options for select/multi-select/cascading widgets.
 * Returns an array of { label, value } pairs.
 * Named columns 'value' and 'label' take precedence over ordinal positions.
 *
 * Defense-in-depth: `tenantId` is passed in the request body and the server
 * asserts it matches the session tenant — complementing the existing
 * ownership check on the connection itself.
 */
export function useSeedQuery(
  connectionId: string | undefined,
  query: string | undefined,
  enabled: boolean,
  extraParams?: Record<string, unknown>,
  tenantId?: string,
): {
  options: ParamSelectorOption[];
  loading: boolean;
  error: Error | null;
  /** Re-run the seed query — the only recovery path after it fails (#1678). */
  refetch: () => void;
} {
  const queryKey = ["param-seed", connectionId, query, extraParams, tenantId];
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
    const rows = Array.isArray(data.data) ? data.data : [];
    return rows.map((row: unknown) => {
      if (row && typeof row === "object") {
        const r = row as Record<string, unknown>;
        const keys = Object.keys(r);
        // Named columns 'value' and 'label' take precedence over ordinal positions.
        // This lets query authors write: RETURN id AS value, name AS label
        const valueKey = "value" in r ? "value" : (keys[0] ?? "");
        const labelKey = "label" in r ? "label" : (keys[1] ?? valueKey);
        const rawValue = r[valueKey];
        // Store the raw value for type preservation; display uses String()
        const value = String(rawValue ?? "");
        const label = String(r[labelKey] ?? value);
        return { value, label, rawValue };
      }
      return { value: String(row), label: String(row), rawValue: row };
    });
  }, [data]);

  return { options, loading: isLoading, error: error ?? null, refetch };
}
