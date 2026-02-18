"use client";

import { useQuery } from "@tanstack/react-query";

interface WidgetQueryInput {
  connectionId: string;
  query: string;
  params?: Record<string, unknown>;
}

interface QueryResult {
  data: unknown;
  fields?: unknown;
}

/**
 * Cached query hook for widget data. Uses React Query's cache with a stable
 * key based on connectionId + query text, so the same query is never executed
 * twice (e.g. when navigating from view mode to edit mode).
 *
 * For user-triggered preview queries in the editor, use useQueryExecution (mutation) instead.
 */
export function useWidgetQuery(input: WidgetQueryInput | null) {
  return useQuery<QueryResult, Error>({
    queryKey: ["widget-query", input?.connectionId, input?.query, input?.params],
    queryFn: async () => {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Query execution failed");
      }
      return res.json();
    },
    enabled: !!input?.connectionId && !!input?.query,
    staleTime: 5 * 60 * 1000, // 5 minutes — don't refetch on mount if fresh
    retry: false,
  });
}
