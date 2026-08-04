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
 * Only non-empty values of params in `syncable` are included, prefixed with
 * "param_". e.g., { year: "1999", dept: "" } → ?param_year=1999
 *
 * `syncable` is required, not optional: URL sync is opt-in per widget, and an
 * omitted allow-list would silently publish every parameter.
 */
export function buildUrlParams(
  params: Record<string, unknown>,
  syncable: ReadonlySet<string>,
): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!syncable.has(key)) continue;
    if (value !== undefined && value !== null && String(value) !== "") {
      sp.set(`${PARAM_PREFIX}${key}`, String(value));
    }
  }
  sp.sort();
  return sp;
}

/**
 * Build the dashboard URL for the current parameter store values.
 * Returns the bare pathname when nothing is left to sync.
 */
export function buildParamsUrl(
  pathname: string,
  parameters: Record<string, { value: unknown } | undefined>,
  syncable: ReadonlySet<string>,
): string {
  const sp = buildUrlParams(
    Object.fromEntries(
      Object.entries(parameters).map(([key, entry]) => [key, entry?.value]),
    ),
    syncable,
  );
  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * Suffixes that range widgets append to their parameter name
 * (see `useParamActions.setCompanion`).
 */
const COMPANION_SUFFIXES = ["from", "to", "min", "max"];

/**
 * Extract the parameter names allowed in the URL — those whose widget turned
 * "Sync to URL" on. Sync is opt-in: the chart option defaults to false and is
 * absent until the author toggles it, so anything else (an untouched widget, a
 * click-action or form parameter) stays out of the address bar.
 */
export function extractSyncParams(layout: DashboardLayoutV2): Set<string> {
  const sync = new Set<string>();
  for (const page of layout.pages) {
    for (const widget of page.widgets) {
      if (widget.chartType !== "parameter-select") continue;
      const opts = (widget.settings?.chartOptions ?? {}) as Record<
        string,
        unknown
      >;
      const paramName = opts.parameterName as string | undefined;
      if (paramName && opts.syncToUrl === true) {
        sync.add(paramName);
        // ponytail: add every companion key regardless of parameterType —
        // a `select` simply never writes them, so the extra entries are inert.
        for (const suffix of COMPANION_SUFFIXES) {
          sync.add(`${paramName}_${suffix}`);
        }
      }
    }
  }
  return sync;
}
