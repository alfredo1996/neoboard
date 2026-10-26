import type { ParameterEntry } from "@/stores/parameter-store";
import { paramLabel } from "@/lib/parameter/param-label";
import {
  filterParentParams,
  formatParameterValue,
} from "@/lib/parameter/format-parameter-value";
import type { ParameterSourceMap } from "@/lib/parameter/collect-parameter-names";

export interface DashboardFilter {
  id: string;
  label: string;
  /** Formatted value; undefined while the filter is unset. */
  value?: string;
  /** "<selector title> · <page title>", when a widget on the dashboard sets it. */
  where?: string;
  sourceWidgetId?: string;
  pageId?: string;
  /** Hover text for a set filter: what set it. */
  title?: string;
}

/**
 * Every filter on the dashboard (#2297): the parameters its widgets set, plus
 * any set parameter no widget declares (a URL value). Set filters first, unset
 * after, each group by label. A range's `_from`/`_to` replace their parent.
 */
export function buildDashboardFilters(
  sourceMap: ParameterSourceMap,
  parameters: Record<string, ParameterEntry>,
): DashboardFilter[] {
  const setEntries = filterParentParams(Object.entries(parameters));
  const setNames = new Set(Object.keys(parameters));
  const isRangeParent = (name: string) =>
    ["_from", "_to", "_min", "_max"].some((s) => setNames.has(name + s));

  const make = (name: string, entry?: ParameterEntry): DashboardFilter => {
    const sources = sourceMap[name] ?? [];
    const source =
      sources.find((s) => s.widgetId === entry?.sourceWidgetId) ?? sources[0];
    return {
      id: name,
      label: paramLabel(name, sourceMap),
      value: entry ? formatParameterValue(entry.value) : undefined,
      where: source ? `${source.widgetTitle} · ${source.pageTitle}` : undefined,
      sourceWidgetId: entry?.sourceWidgetId ?? source?.widgetId,
      pageId: source?.pageId,
      title: entry?.source ? `Set by ${entry.source}` : undefined,
    };
  };
  const byLabel = (a: DashboardFilter, b: DashboardFilter) =>
    a.label.localeCompare(b.label);

  const set = setEntries
    .map(([name, entry]) => make(name, entry))
    .sort(byLabel);
  const unset = Object.keys(sourceMap)
    .filter((name) => !setNames.has(name) && !isRangeParent(name))
    .map((name) => make(name))
    .sort(byLabel);
  return [...set, ...unset];
}
