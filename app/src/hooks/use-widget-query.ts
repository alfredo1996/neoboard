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
 */
export function useWidgetQuery(input: WidgetQueryInput | null) {
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
    // staleTime: 0 (default) — always refetch on mount so charts stay current.
    // We still benefit from deduplication within the same render cycle.
    retry: false,
  });
}
