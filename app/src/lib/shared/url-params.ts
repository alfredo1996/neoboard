/**
 * URL parameter deep-linking utilities.
 * Syncs dashboard parameters with URL search params.
 */

import type { DashboardLayoutV2 } from "@/lib/db/schema";

const PARAM_PREFIX = "param_";

/**
 * Extract parameter values from URL search params.
 * Only keys prefixed with "param_" are extracted; the prefix is stripped.
 * e.g., ?param_year=1999&param_dept=Sales → { year: "1999", dept: "Sales" }
 */
export function parseUrlParams(
  searchParams: URLSearchParams,
): Record<string, string> {
  const result: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    if (key.startsWith(PARAM_PREFIX) && value) {
      result[key.slice(PARAM_PREFIX.length)] = value;
    }
  });
  return result;
}

/**
 * Build URL search params from parameter store values.
 * Only non-empty values are included, prefixed with "param_".
 * e.g., { year: "1999", dept: "" } → ?param_year=1999
 */
export function buildUrlParams(
  params: Record<string, unknown>,
  excludeFromUrl?: Set<string>,
): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (excludeFromUrl?.has(key)) continue;
    if (value !== undefined && value !== null && String(value) !== "") {
      sp.set(`${PARAM_PREFIX}${key}`, String(value));
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
