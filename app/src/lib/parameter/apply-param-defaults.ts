import type { DashboardLayoutV2 } from "@/lib/db/schema";
import type { ParameterType } from "@/stores/parameter-store";

/**
 * A parameter widget's configured "Default value", with enough of the widget's
 * own configuration to seed the store correctly.
 *
 * `type` and `rangeMin` are here because the caller needs them and only the
 * widget knows them. Before #1517 this helper returned a bare
 * `name -> value` map, so every default was applied as `"text"`: a
 * `number-range` never got its `{name}_min` / `{name}_max` companions — the
 * only thing its queries actually read — and a `multi-select` default reached
 * the store as a scalar where an array was expected.
 */
export interface ParamDefault {
  /** Parameter name, without the `param_` prefix. */
  name: string;
  /** The raw value as configured in the editor. */
  value: string;
  /** The widget's parameter type, used to coerce and to seed companions. */
  type: ParameterType;
  /** The widget that configured it — lets the parameter chip link back. */
  widgetId: string;
  /** Lower bound for `number-range`, used as the `_min` companion. */
  rangeMin?: number;
}

/**
 * The configured default for one widget, or `null` if it has none.
 * Split out of the page/widget walk so neither half carries the other's
 * branching.
 */
function readWidgetDefault(
  widget: DashboardLayoutV2["pages"][number]["widgets"][number],
): ParamDefault | null {
  if (widget.chartType !== "parameter-select") return null;
  const opts = (widget.settings?.chartOptions ?? {}) as Record<string, unknown>;
  const name = opts.parameterName as string | undefined;
  const value = opts.defaultValue as string | undefined;
  if (!name || !value) return null;

  const type = (opts.parameterType as ParameterType | undefined) ?? "select";
  if (type !== "number-range") {
    return { name, value, type, widgetId: widget.id };
  }
  const min = Number(opts.rangeMin);
  return {
    name,
    value,
    type,
    widgetId: widget.id,
    rangeMin: Number.isFinite(min) ? min : 0,
  };
}

/**
 * Extract default parameter values from parameter-select widgets in the layout.
 * Returns one entry per widget that has a non-empty default, in page order.
 */
export function extractParamDefaults(
  layout: DashboardLayoutV2,
): ParamDefault[] {
  return layout.pages
    .flatMap((page) => page.widgets)
    .map(readWidgetDefault)
    .filter((entry): entry is ParamDefault => entry !== null);
}

/** One store entry to seed, in the order `setParameter` should be called. */
export interface ParamSeed {
  name: string;
  value: unknown;
  type: ParameterType;
  widgetId: string;
}

/**
 * Expand configured defaults into the store entries they imply.
 *
 * Kept separate from the effect that writes them so the mapping is unit
 * testable — a client component's body is invisible to coverage, and this is
 * where the whole of #1517 lives.
 *
 * A `number-range` expands to three entries: the `[min, max]` tuple that
 * positions the slider, plus the `{name}_min` / `{name}_max` scalars its
 * queries actually read. The editor offers a single Default value, which is
 * taken as the UPPER bound with `rangeMin` as the lower — the reading every
 * seeded showcase relies on (`LIMIT $param_x_max`). A default that is not a
 * finite number is dropped rather than seeded as NaN.
 *
 * Every other type yields a single entry under its real type, so the store's
 * own coercion runs — a `multi-select` scalar becomes a one-element array
 * instead of staying a string.
 */
export function expandParamDefaults(defaults: ParamDefault[]): ParamSeed[] {
  return defaults.flatMap((d): ParamSeed[] => {
    if (d.type !== "number-range") {
      return [
        { name: d.name, value: d.value, type: d.type, widgetId: d.widgetId },
      ];
    }
    const min = d.rangeMin ?? 0;
    const max = Number(d.value);
    if (!Number.isFinite(max)) return [];
    return [
      {
        name: d.name,
        value: [min, max],
        type: "number-range" as const,
        widgetId: d.widgetId,
      },
      {
        name: `${d.name}_min`,
        value: min,
        type: "text" as const,
        widgetId: d.widgetId,
      },
      {
        name: `${d.name}_max`,
        value: max,
        type: "text" as const,
        widgetId: d.widgetId,
      },
    ];
  });
}
