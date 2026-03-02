import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ParamSelectorOption } from "@neoboard/components";

interface SeedQueryResult {
  data: unknown;
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
): { options: ParamSelectorOption[]; loading: boolean } {
  const { data, isLoading } = useQuery<SeedQueryResult>({
    queryKey: ["param-seed", connectionId, query, extraParams, tenantId],
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
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(
          (body.error as string | undefined) || "Seed query failed",
        );
      }
      return res.json() as Promise<SeedQueryResult>;
    },
    enabled: enabled && !!connectionId && !!query,
    staleTime: 30_000, // 30 s — options don't change often
    retry: false,
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

  return { options, loading: isLoading };
}
