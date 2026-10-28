import type { ParameterEntry } from "@/stores/parameter-store";
import { paramLabel } from "@/lib/parameter/param-label";
import { formatParameterValue } from "@/lib/parameter/format-parameter-value";
import type {
  ParameterSource,
  ParameterSourceMap,
} from "@/lib/parameter/collect-parameter-names";

/**
 * "on <page>", with the widget's title first only when it has a real one that
 * is not the filter's name (the chart type standing in for a title is not).
 */
const whereLine = (s: ParameterSource, label: string) =>
  s.untitled || s.widgetTitle.trim() === label
    ? `on ${s.pageTitle}`
    : `${s.widgetTitle.trim()} on ${s.pageTitle}`;

/** Sub-parameters a range selector sets beside its own value. */
const COMPANION_SUFFIXES = ["_from", "_to", "_min", "_max"];

/** Every parameter one clear of a filter removes: it and its range companions. */
export function filterClearNames(id: string): string[] {
  return [id, ...COMPANION_SUFFIXES.map((s) => id + s)];
}

export interface DashboardFilter {
  id: string;
  label: string;
  /** Formatted value; undefined while the filter is unset. */
  value?: string;
  /** "on <page>" or "<widget title> on <page>", when a widget on the dashboard sets it. */
  where?: string;
  sourceWidgetId?: string;
  pageId?: string;
  /** Hover text for a set filter: what set it. */
  title?: string;
}

/**
 * Every filter on the dashboard (#2297): the parameters its widgets set, plus
 * any set parameter no widget declares (a URL value). Set filters first, unset
 * after, each group by label. A range is one filter under its parent: its
 * `_from`/`_to`/`_min`/`_max` companions are not listed.
 */
export function buildDashboardFilters(
  sourceMap: ParameterSourceMap,
  parameters: Record<string, ParameterEntry>,
): DashboardFilter[] {
  const setNames = new Set(Object.keys(parameters));
  const isCompanion = (name: string) =>
    COMPANION_SUFFIXES.some(
      (s) => name.endsWith(s) && setNames.has(name.slice(0, -s.length)),
    );
  const setEntries = Object.entries(parameters).filter(
    ([name]) => !isCompanion(name),
  );

  const make = (name: string, entry?: ParameterEntry): DashboardFilter => {
    const sources = sourceMap[name] ?? [];
    const source =
      sources.find((s) => s.widgetId === entry?.sourceWidgetId) ?? sources[0];
    return {
      id: name,
      label: paramLabel(name, sourceMap),
      value: entry ? formatParameterValue(entry.value) : undefined,
      where: source
        ? whereLine(source, paramLabel(name, sourceMap))
        : undefined,
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
    .filter((name) => !setNames.has(name))
    .map((name) => make(name))
    .sort(byLabel);
  return [...set, ...unset];
}
