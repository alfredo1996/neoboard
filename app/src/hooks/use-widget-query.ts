"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParameterStore } from "@/stores/parameter-store";
import { resolveRelativePreset } from "@/lib/date-utils";
import type { RelativeDatePreset } from "@neoboard/components";

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
  /** True when the server truncated the result set to MAX_ROWS (10 000). */
  truncated?: boolean;
  /** Server-side query execution time in milliseconds. */
  serverDurationMs?: number;
}

/**
 * Returns true when every `$param_xxx` token in the query has a non-null,
 * non-empty value in allParams.  Queries with no parameter tokens always
 * return true so widgets without parameters are unaffected.
 *
 * @visibleForTesting
 */
export function allReferencedParamsReady(
  query: string,
  allParams: Record<string, unknown>
): boolean {
  const regex = /\$param_(\w+)/g;
  let match;
  while ((match = regex.exec(query)) !== null) {
    const name = match[1];
    const val = allParams[name];
    if (
      val === undefined ||
      val === null ||
      val === "" ||
      (Array.isArray(val) && val.length === 0)
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Returns the list of $param_xxx names in the query that have no value yet.
 * Mirrors the logic of allReferencedParamsReady but returns the names
 * instead of a boolean.
 *
 * @visibleForTesting
 */
export function getMissingParamNames(
  query: string,
  allParams: Record<string, unknown>
): string[] {
  const regex = /\$param_(\w+)/g;
  const missing: string[] = [];
  const seen = new Set<string>();
  let match;
  while ((match = regex.exec(query)) !== null) {
    const name = match[1];
    if (seen.has(name)) continue;
    seen.add(name);
    const val = allParams[name];
    if (
      val === undefined ||
      val === null ||
      val === "" ||
      (Array.isArray(val) && val.length === 0)
    ) {
      missing.push(name);
    }
  }
  return missing;
}

/**
 * Extracts referenced `$param_xxx` names from a query string and returns
 * only the matching parameter values.
 *
 * @visibleForTesting
 */
export function extractReferencedParams(
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
  options?: { staleTime?: number; refetchInterval?: number | false }
) {
  // Get parameters from store - using selector that returns stable value
  const parameters = useParameterStore((s) => s.parameters);

  const allParameters = useMemo(() => {
    const result: Record<string, unknown> = {};
    // First pass: populate all raw store values
    for (const [name, entry] of Object.entries(parameters)) {
      result[name] = entry.value;
    }
    // Second pass: for date-relative entries, override _from/_to with values
    // resolved at call time (not at selection time) so "Last 7 days" always
    // refers to today's date, not the date when the preset was clicked.
    for (const [name, entry] of Object.entries(parameters)) {
      if (entry.type === "date-relative" && entry.value) {
        const { from, to } = resolveRelativePreset(entry.value as RelativeDatePreset);
        result[`${name}_from`] = from;
        result[`${name}_to`] = to;
      }
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

  const queryResult = useQuery<QueryResult, Error>({
    queryKey: [
      "widget-query",
      mergedInput?.connectionId,
      mergedInput?.query,
      mergedInput?.params,
    ],
    queryFn: async () => {
      const fetchStart = performance.now();
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mergedInput),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Query execution failed");
      }
      const result: QueryResult = await res.json();
      if (process.env.NODE_ENV === "development") {
        const roundTripMs = Math.round(performance.now() - fetchStart);
        console.debug(
          `[widget-query] roundTrip=${roundTripMs}ms server=${result.serverDurationMs ?? "?"}ms query=${mergedInput?.query?.slice(0, 80)}`
        );
      }
      return result;
    },
    enabled:
      !!mergedInput?.connectionId &&
      !!mergedInput?.query &&
      allReferencedParamsReady(mergedInput.query, allParameters),
    // staleTime controls how long cached data is considered fresh.
    // When enableCache is false on the widget, callers pass 0 (always refetch).
    // When enableCache is true, callers pass cacheTtlMinutes * 60_000.
    staleTime: options?.staleTime ?? 0,
    refetchInterval: options?.refetchInterval,
    retry: false,
  });

  const missingParams = useMemo(
    () =>
      mergedInput?.query
        ? getMissingParamNames(mergedInput.query, allParameters)
        : [],
    [mergedInput, allParameters],
  );

  return { ...queryResult, missingParams };
}
