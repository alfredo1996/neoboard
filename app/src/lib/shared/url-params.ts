/**
 * URL parameter deep-linking utilities.
 * Syncs dashboard parameters with URL search params.
 */

import type { DashboardLayoutV2 } from "@/lib/db/schema";

const PARAM_PREFIX = "param_";

/**
 * Suffixes that range widgets append to their parameter name
 * (see `useParamActions.setCompanion`).
 */
const COMPANION_SUFFIXES = ["from", "to", "min", "max"];
const COMPANION_KEY = /^(.+)_(from|to|min|max)$/;

/**
 * What one `param_` key can carry: a scalar, a multi-select's values, or a
 * range parent rebuilt from its companions.
 */
export type UrlParamValue = string | string[] | { from: string; to: string };

const isSet = (v: unknown) => v !== undefined && v !== null && String(v) !== "";

/**
 * Extract parameter values from URL search params.
 * Only keys prefixed with "param_" are extracted; the prefix is stripped.
 * e.g., ?param_year=1999&param_dept=Sales → { year: "1999", dept: "Sales" }
 *
 * A repeated key is a multi-select: `?param_tags=a&param_tags=b` → `["a","b"]`.
 * A range widget positions itself from its parent (`period` = `{from,to}`,
 * `yr` = `[min,max]`) while its queries read the companions, and only the
 * companions have a URL form — so the parent is rebuilt here, or the
 * recipient's picker lands empty.
 */
export function parseUrlParams(
  searchParams: URLSearchParams,
): Record<string, UrlParamValue> {
  const result: Record<string, UrlParamValue> = {};
  for (const key of new Set(searchParams.keys())) {
    if (!key.startsWith(PARAM_PREFIX)) continue;
    const values = searchParams.getAll(key).filter((v) => v !== "");
    if (values.length === 0) continue;
    result[key.slice(PARAM_PREFIX.length)] =
      values.length === 1 ? values[0] : values;
  }
  const scalar = (name: string) => {
    const v = result[name];
    return typeof v === "string" ? v : undefined;
  };
  // ponytail: a text parameter literally named `x_to` grows an `x` parent —
  // the same assumption the sync allow-list and the parameter bar make.
  for (const name of Object.keys(result)) {
    const m = COMPANION_KEY.exec(name);
    if (!m || result[m[1]] !== undefined) continue;
    const base = m[1];
    if (m[2] === "from" || m[2] === "to") {
      result[base] = {
        from: scalar(`${base}_from`) ?? "",
        to: scalar(`${base}_to`) ?? "",
      };
    } else {
      const min = scalar(`${base}_min`);
      const max = scalar(`${base}_max`);
      if (min !== undefined && max !== undefined) result[base] = [min, max];
    }
  }
  return result;
}

/**
 * Build URL search params from parameter store values.
 * Only non-empty values of params in `syncable` are included, prefixed with
 * "param_". e.g., { year: "1999", dept: "" } → ?param_year=1999
 *
 * `syncable` is required, not optional: URL sync is opt-in per widget, and an
 * omitted allow-list would silently publish every parameter.
 *
 * An array (multi-select) becomes repeated keys. A range parent rides on its
 * scalar companions; any other object has no URL form and is dropped rather
 * than serialised as "[object Object]".
 */
export function buildUrlParams(
  params: Record<string, unknown>,
  syncable: ReadonlySet<string>,
): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!syncable.has(key) || !isSet(value)) continue;
    if (COMPANION_SUFFIXES.some((s) => isSet(params[`${key}_${s}`]))) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        if (isSet(v)) sp.append(`${PARAM_PREFIX}${key}`, String(v));
      }
    } else if (typeof value !== "object") {
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
