"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useParameterStore } from "@/stores/parameter-store";
import type { ParameterType } from "@/stores/parameter-store";
import { useSeedQuery } from "@/hooks/use-seed-query";
import { useConnectionStatusStore } from "@/stores/connection-status-store";
import { ConnectorUnavailableError } from "@/lib/api/api-client";

/** Debounce delay (ms) before the typed search term is sent to the seed query. */
export const SEED_QUERY_SEARCH_DEBOUNCE_MS = 300;

/**
 * The seed query filters on the server: the widget is searchable and the seed
 * consumes `$param_search`. Its rows then arrive already matched, possibly on
 * a column other than the label, and must not be filtered again (#1411).
 */
export function seedFiltersOnServer(
  searchable: boolean | undefined,
  seedQuery: string | undefined,
): boolean {
  return !!searchable && /\$param_search\b/.test(seedQuery ?? "");
}

/**
 * The extra params a seed request carries: the parent's value, plus the typed
 * search term. A seed that consumes `$param_search` always gets the term, ""
 * while the box is empty — a missing `$param_*` fails the whole query, so it
 * could never load before a term was typed, nor after the box closed (#1743).
 */
export function buildSeedExtraParams(
  parentParams: Record<string, string>,
  searchable: boolean | undefined,
  seedQuery: string | undefined,
  search: string,
): Record<string, string> | undefined {
  if (searchable && (search || seedFiltersOnServer(searchable, seedQuery))) {
    return { ...parentParams, param_search: search };
  }
  return Object.keys(parentParams).length > 0 ? parentParams : undefined;
}

export interface SeedQueryResult {
  options: { value: string; label: string; rawValue?: unknown }[];
  loading: boolean;
  /**
   * Why the option list is empty, when it is because the seed query failed.
   * Dropped here until #1678: a dead connector rendered as an empty dropdown,
   * and every widget gated on the parameter waited for it forever.
   */
  error: Error | null;
  /**
   * Re-run the seed query: the immediate way back. The dashboard also re-probes
   * a dead connection by itself every `DEAD_CONNECTOR_TTL_MS` (#2167).
   */
  refetch: () => void;
  setSearchTerm: (term: string) => void;
  parentValue: string | undefined;
  /** See `seedFiltersOnServer`. */
  serverFiltered: boolean;
}

/**
 * Coerce a parent parameter's raw value to a scalar string suitable for
 * substitution. Arrays (multi-select) and plain objects (date-range) are
 * rejected — `String([1,2,3])` → "1,2,3" and `String({from,to})` →
 * "[object Object]" would corrupt the seed query. The caller treats
 * `undefined` as "no parent value yet" and disables the cascade.
 */
function scalarParentValue(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  // Arrays, objects, functions, symbols, bigints — none make sense as a
  // single substituted scalar. Returning undefined here means the cascade
  // stays disabled until the parent reaches a scalar state.
  return undefined;
}

/**
 * The cascade parent's current dashboard value, and the `param_<parent>` it
 * binds in the seed query. `parentValue` is undefined — "no parent value
 * yet" — for an unset or non-scalar parent, and `nonScalar` tells the second
 * case apart; `parentParams` is empty until the value is non-empty. The widget
 * editor's Test Seed Query reads it here so it binds the parent the same way
 * the dashboard does (#1951).
 */
export function useCascadeParent(parentParameterName?: string): {
  parentValue: string | undefined;
  parentParams: Record<string, string>;
  nonScalar: boolean;
} {
  const parentRawValue = useParameterStore((s) =>
    parentParameterName ? s.parameters[parentParameterName]?.value : undefined,
  );
  const parentValue = parentParameterName
    ? scalarParentValue(parentRawValue)
    : undefined;
  const parentParams = useMemo(
    () =>
      parentParameterName && parentValue
        ? { [`param_${parentParameterName}`]: parentValue }
        : {},
    [parentParameterName, parentValue],
  );
  return {
    parentValue,
    parentParams,
    nonScalar: parentRawValue != null && parentValue === undefined,
  };
}

/**
 * Loads the option list for an option-backed parameter widget.
 *
 * "Cascading" is not a separate widget type — it is simply a select (or
 * multi-select) that names a `parentParameterName`. When it does, the seed
 * query is held back until the parent has a scalar value, and the parent is
 * passed through as `param_<parent>` (#1360).
 */
export function useSeedQueryOptions(
  parameterType: ParameterType,
  connectionId?: string,
  seedQuery?: string,
  parentParameterName?: string,
  searchable = true,
  /** The selector widget's saved per-card database (#1824). */
  database?: string,
): SeedQueryResult {
  const { parentValue, parentParams } = useCascadeParent(parentParameterName);
  const { data: session } = useSession();
  const tenantId = session?.user?.tenantId;

  // A parent name is what makes this select cascading.
  const hasParent = !!parentParameterName;

  // Debounced search term — only used when `searchable` is true.
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [prevSearchable, setPrevSearchable] = useState(searchable);
  const [prevParentValue, setPrevParentValue] = useState(parentValue);

  // If the widget flips from searchable→non-searchable mid-session, flush
  // any pending search term so it doesn't leak into the next seed query.
  // Implemented as React "adjust state in render" rather than an effect —
  // see https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (searchable !== prevSearchable) {
    setPrevSearchable(searchable);
    if (!searchable) {
      setSearchTerm("");
      setDebouncedSearch("");
    }
  }

  // The parent moved, so the option list is about to be replaced. Drop the
  // term the user typed against the old list — otherwise it silently filters
  // the freshly-loaded one (#1360).
  if (parentValue !== prevParentValue) {
    setPrevParentValue(parentValue);
    setSearchTerm("");
    setDebouncedSearch("");
  }

  useEffect(() => {
    if (!searchable) return;
    const timer = setTimeout(
      () => setDebouncedSearch(searchTerm),
      SEED_QUERY_SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [searchTerm, searchable]);

  // Seed query enablement
  const needsSeed =
    parameterType === "select" || parameterType === "multi-select";

  const parentReady = !hasParent || !!parentValue;

  const seedExtraParams = useMemo(
    () =>
      buildSeedExtraParams(
        parentParams,
        searchable,
        seedQuery,
        debouncedSearch,
      ),
    [parentParams, searchable, seedQuery, debouncedSearch],
  );

  const { options, loading, error, refetch } = useSeedQuery(
    connectionId,
    seedQuery,
    needsSeed && parentReady,
    seedExtraParams,
    tenantId,
    database,
  );

  // The dashboard's probe re-runs a parked seed (#2167), and a seed with no
  // options goes back to pending while it runs. On a connection still flagged
  // dead, keep naming the connector, and its Retry, rather than a skeleton for
  // the whole connect timeout: what a card does for its widget (#1888).
  const flagged = useConnectionStatusStore(
    (s) => !!connectionId && s.statuses[connectionId] === "error",
  );
  const [lastError, setLastError] = useState(error);
  if (error && error !== lastError) setLastError(error);
  const held =
    loading && flagged && lastError instanceof ConnectorUnavailableError
      ? lastError
      : null;

  return {
    options,
    loading: loading && !held,
    error: error ?? held,
    refetch,
    setSearchTerm,
    parentValue,
    serverFiltered: seedFiltersOnServer(searchable, seedQuery),
  };
}
