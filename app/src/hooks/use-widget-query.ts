"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParameterStore } from "@/stores/parameter-store";

interface WidgetQueryInput {
  connectionId: string;
  query: string;
  params?: Record<string, unknown>;
}

interface QueryResult {
  data: unknown;
  fields?: unknown;
  /** Unique ID for this execution, generated server-side. Can be used as a
   *  stable cache/state key (e.g. to detect when graph data changed). */
  resultId: string;
}

/**
 * Extracts referenced `$param_xxx` names from a query string and returns
 * only the matching parameter values.
 */
function extractReferencedParams(
  query: string,
  allParams: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const regex = /\$param_(\w+)/g;
  let match;
  while ((match = regex.exec(query)) !== null) {
    const name = match[1];
    if (name in allParams) {
      result["param_" + name] = allParams[name];
    }
  }
  return result;
}

/**
 * Cached query hook for widget data. Uses React Query's cache with a stable
 * key based on connectionId + query text, so the same query is never executed
 * twice (e.g. when navigating from view mode to edit mode).
 *
 * Automatically merges parameter store values into query params when the query
 * references `$param_xxx` placeholders.
 *
 * For user-triggered preview queries in the editor, use useQueryExecution (mutation) instead.
 *
 * @param options.staleTime - How long (ms) cached data is considered fresh.
 *   Defaults to 0 (always refetch on mount). Pass `Infinity` to never refetch.
 */
export function useWidgetQuery(
  input: WidgetQueryInput | null,
  options?: { staleTime?: number }
) {
  // Get parameters from store - using selector that returns stable value
  const parameters = useParameterStore((s) => s.parameters);

  const allParameters = useMemo(() => {
    const result: Record<string, unknown> = {};
    for (const [name, entry] of Object.entries(parameters)) {
      result[name] = entry.value;
    }
    return result;
  }, [parameters]);

  const inputQuery = input?.query;
  const inputParams = input?.params;

  const mergedParams = useMemo(() => {
    if (!inputQuery) return inputParams;
    const referenced = extractReferencedParams(inputQuery, allParameters);
    if (Object.keys(referenced).length === 0) return inputParams;
    return { ...inputParams, ...referenced };
  }, [inputQuery, inputParams, allParameters]);

  const mergedInput = useMemo(() => {
    if (!input) return null;
    return { ...input, params: mergedParams };
  }, [input, mergedParams]);

  return useQuery<QueryResult, Error>({
    queryKey: [
      "widget-query",
      mergedInput?.connectionId,
      mergedInput?.query,
      mergedInput?.params,
    ],
    queryFn: async () => {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mergedInput),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Query execution failed");
      }
      return res.json();
    },
    enabled: !!mergedInput?.connectionId && !!mergedInput?.query,
    // staleTime controls how long cached data is considered fresh.
    // When enableCache is false on the widget, callers pass 0 (always refetch).
    // When enableCache is true, callers pass cacheTtlMinutes * 60_000.
    staleTime: options?.staleTime ?? 0,
    retry: false,
  });
}
