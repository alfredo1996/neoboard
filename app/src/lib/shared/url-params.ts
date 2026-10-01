/**
 * URL parameter deep-linking utilities.
 * Syncs dashboard parameters with URL search params.
 */

import type { DashboardLayoutV2 } from "@/lib/db/schema";
import type { ParamSeed } from "@/lib/parameter/apply-param-defaults";
import type { ParameterType } from "@/stores/parameter-store";

const PARAM_PREFIX = "param_";

/**
 * Restore parameter values from URL search params, typed by the widget that
 * owns each one (#2097): a multi-select from its repeated keys, a range
 * rebuilt from its companions. A value's marker restores its own type, so a
 * select needs no loaded option to get its number back (#2124).
 * A seed with an `undefined` value is a range bound to clear.
 * e.g., ?param_year=n:1999&param_dept=Sales → year 1999, dept "Sales"
 */
export function parseUrlParams(
  searchParams: URLSearchParams,
  layout: DashboardLayoutV2,
): ParamSeed[] {
  const seeds: ParamSeed[] = [];
  const owned = new Set<string>();
  for (const widget of parameterWidgets(layout)) {
    owned.add(widget.name);
    urlKeys(widget).forEach((key) => owned.add(key));
    seeds.push(...widgetSeeds(searchParams, widget));
  }
  searchParams.forEach((value, key) => {
    const name = key.slice(PARAM_PREFIX.length);
    if (key.startsWith(PARAM_PREFIX) && value && !owned.has(name)) {
      seeds.push({
        name,
        value: decodeItem(value),
        type: "text",
        widgetId: "",
      });
    }
  });
  return seeds;
}

/**
 * Build URL search params from parameter store values.
 * Only non-empty values of params in `syncable` are included, prefixed with
 * "param_". e.g., { year: 1999, dept: "" } → ?param_year=n:1999
 *
 * `syncable` maps each key to its widget's type. It is required, not
 * optional: URL sync is opt-in per widget, and an omitted allow-list would
 * silently publish every parameter.
 */
export function buildUrlParams(
  params: Record<string, unknown>,
  syncable: ReadonlyMap<string, ParameterType>,
): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const type = syncable.get(key);
    if (!type) continue;
    // A range bound is rebuilt under its widget's type, so it stays unmarked.
    const write = RANGE_SUFFIXES[type] ? String : encodeItem;
    // A list repeats its key, so a value with a comma survives (#2097).
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined && item !== null && String(item) !== "") {
        sp.append(`${PARAM_PREFIX}${key}`, write(item));
      }
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
  syncable: ReadonlyMap<string, ParameterType>,
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

interface ParamWidget {
  id: string;
  name: string;
  type: ParameterType;
  sync: boolean;
}

function parameterWidgets(layout: DashboardLayoutV2): ParamWidget[] {
  return layout.pages
    .flatMap((page) => page.widgets)
    .flatMap((widget) => {
      if (widget.chartType !== "parameter-select") return [];
      const opts = (widget.settings?.chartOptions ?? {}) as Record<
        string,
        unknown
      >;
      const name = opts.parameterName as string | undefined;
      if (!name) return [];
      const type =
        (opts.parameterType as ParameterType | undefined) ?? "select";
      return [{ id: widget.id, name, type, sync: opts.syncToUrl === true }];
    });
}

/** The suffixes a range widget writes (see `useParamActions.setCompanion`). */
const RANGE_SUFFIXES: Partial<Record<ParameterType, [string, string]>> = {
  "date-range": ["from", "to"],
  "number-range": ["min", "max"],
};

/** A value's type marker; text that starts like one is escaped with `s:`. */
const MARKER = /^[nbs]:/;

/** A number or boolean carries its type in the link (#2124). */
function encodeItem(item: string | number | boolean | unknown[]): string {
  if (typeof item === "number") return `n:${item}`;
  if (typeof item === "boolean") return `b:${item}`;
  const text = String(item);
  return MARKER.test(text) ? `s:${text}` : text;
}

/**
 * The value `encodeItem` wrote, or a Default value marked the same way
 * (#2158); a malformed number stays text.
 */
export function decodeItem(text: string): unknown {
  if (!MARKER.test(text)) return text;
  const body = text.slice(2);
  if (text.startsWith("s")) return body;
  if (text.startsWith("b")) {
    if (body === "true" || body === "false") return body === "true";
    return text;
  }
  // `Number("")` is 0: a blank body is malformed, not zero.
  const n = body.trim() === "" ? Number.NaN : Number(body);
  return Number.isNaN(n) ? text : n;
}

/**
 * The URL keys a widget's value travels under. A range travels as its two
 * companions: its `{from,to}` or `[min,max]` parent has no flat form (#2097).
 */
function urlKeys({ name, type }: Pick<ParamWidget, "name" | "type">): string[] {
  return RANGE_SUFFIXES[type]?.map((s) => `${name}_${s}`) ?? [name];
}

/** One widget's store entries, rebuilt from the URL under its own type. */
function widgetSeeds(sp: URLSearchParams, w: ParamWidget): ParamSeed[] {
  const seed = (name: string, value: unknown, type = w.type): ParamSeed => ({
    name,
    value,
    type,
    widgetId: w.id,
  });
  const get = (key: string) => sp.get(`${PARAM_PREFIX}${key}`) || undefined;
  const [lo, hi] = urlKeys(w);

  if (w.type === "date-range") {
    const from = get(lo) ?? "";
    const to = get(hi) ?? "";
    if (!from && !to) return [];
    // The pair is one value: a bound the link left out comes back `undefined`,
    // which the caller clears rather than keep a restored session's bound.
    return [
      seed(w.name, { from, to }),
      seed(lo, from || undefined, "date"),
      seed(hi, to || undefined, "date"),
    ];
  }
  if (w.type === "number-range") {
    const min = Number(get(lo));
    const max = Number(get(hi));
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
    return [
      seed(w.name, [min, max]),
      seed(lo, min, "text"),
      seed(hi, max, "text"),
    ];
  }
  const values = sp
    .getAll(`${PARAM_PREFIX}${w.name}`)
    .filter(Boolean)
    .map(decodeItem);
  if (values.length === 0) return [];
  return [seed(w.name, w.type === "multi-select" ? values : values[0])];
}

/**
 * Extract the URL keys allowed in the address bar, each with its widget's
 * type — those of widgets that turned "Sync to URL" on. Sync is opt-in: the
 * chart option defaults to false and is absent until the author toggles it,
 * so anything else (an untouched widget, a click-action or form parameter)
 * stays out of the address bar.
 */
export function extractSyncParams(
  layout: DashboardLayoutV2,
): Map<string, ParameterType> {
  return new Map(
    parameterWidgets(layout)
      .filter((w) => w.sync)
      .flatMap((w) => urlKeys(w).map((key) => [key, w.type] as const)),
  );
}
