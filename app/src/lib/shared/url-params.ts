/**
 * URL parameter deep-linking utilities.
 * Syncs dashboard parameters with URL search params.
 */

import type { DashboardLayoutV2 } from "@/lib/db/schema";

const PARAM_PREFIX = "param_";

/**
 * Extract parameter values from URL search params.
 *
 * Keys prefixed with `param_` are extracted, prefix stripped. A key that
 * appears once becomes a scalar; a key that appears multiple times
 * becomes an array, in URL order. Empty values are dropped.
 *
 *   ?param_year=1999&param_dept=Sales      → { year: "1999", dept: "Sales" }
 *   ?param_tags=one&param_tags=two         → { tags: ["one", "two"] }
 *
 * The array form is what multi-select / cascading-select parameter
 * widgets need to round-trip through a deep-link.
 */
export function parseUrlParams(
  searchParams: URLSearchParams,
): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  // Collect unique param_-prefixed keys first, then use getAll() so
  // repeated keys produce arrays instead of silently collapsing to the
  // first value (the trap .forEach() falls into).
  const seen = new Set<string>();
  for (const key of searchParams.keys()) {
    if (!key.startsWith(PARAM_PREFIX)) continue;
    if (seen.has(key)) continue;
    seen.add(key);

    const values = searchParams.getAll(key).filter((v) => v !== "");
    if (values.length === 0) continue;

    const name = key.slice(PARAM_PREFIX.length);
    result[name] = values.length === 1 ? values[0] : values;
  }
  return result;
}

/**
 * Build URL search params from parameter store values.
 *
 * Scalars are serialized as a single key (`.set`); arrays are serialized
 * as repeated keys (`.append`) so multi-select values round-trip cleanly
 * through a URL. Empty, null, and undefined elements are filtered out;
 * an empty array drops the param entirely.
 *
 *   { year: "1999", dept: "" }            → ?param_year=1999
 *   { tags: ["drama", "comedy"] }         → ?param_tags=drama&param_tags=comedy
 */
export function buildUrlParams(
  params: Record<string, unknown>,
  excludeFromUrl?: Set<string>,
): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (excludeFromUrl?.has(key)) continue;
    if (value === undefined || value === null) continue;

    const fullKey = `${PARAM_PREFIX}${key}`;
    if (Array.isArray(value)) {
      for (const element of value) {
        if (element === undefined || element === null) continue;
        const s = String(element);
        if (s === "") continue;
        sp.append(fullKey, s);
      }
    } else {
      const s = String(value);
      if (s === "") continue;
      sp.set(fullKey, s);
    }
  }
  sp.sort();
  return sp;
}

/**
 * Extract parameter names that have `syncToUrl: false` in their widget settings.
 * Returns a Set of parameter names that should NOT be synced to the URL.
 * By default (when syncToUrl is omitted or true), params ARE synced.
 */
export function extractNoSyncParams(layout: DashboardLayoutV2): Set<string> {
  const noSync = new Set<string>();
  for (const page of layout.pages) {
    for (const widget of page.widgets) {
      if (widget.chartType !== "parameter-select") continue;
      const opts = (widget.settings?.chartOptions ?? {}) as Record<
        string,
        unknown
      >;
      const paramName = opts.parameterName as string | undefined;
      if (paramName && opts.syncToUrl === false) {
        noSync.add(paramName);
      }
    }
  }
  return noSync;
}
