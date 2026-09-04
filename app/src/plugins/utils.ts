/**
 * Shared utilities for chart plugins.
 */

import { useMemo } from "react";
import type { EChartsClickEvent } from "@neoboard/components";

/**
 * Standard plugin component props passed by chart-renderer.tsx.
 * Each plugin picks the subset it needs.
 */
export interface PluginProps {
  data: unknown;
  settings: Record<string, unknown>;
  stylingRules?: unknown[];
  paramValues?: Record<string, unknown>;
  colorScales?: unknown[];
  onChartClick?: (point: Record<string, unknown>) => void;
  connectionId?: string;
  widgetId?: string;
  resultId?: string;
  query?: string;
  autoFit?: boolean;
  clickableColumns?: string[];
}

/**
 * Creates an ECharts-compatible onClick handler from the plugin's
 * raw `onChartClick` callback. Enriches the ECharts event with the
 * original data row so column-name source fields resolve correctly.
 *
 * Usage inside an ECharts plugin component:
 *   const onClick = useEChartsClick(onChartClick, data);
 *   <BarChart onClick={onClick} ... />
 */
/**
 * `resolve-click-action.ts` presence-tests these two keys (`:58`, `:117`,
 * `:160`) to switch into the table cell-click branch, so a raw column of
 * either name would reroute a chart click and then resolve to null. Only these
 * two are control keys — a column called `_clickedAt` is ordinary data.
 */
const CLICK_CONTROL_KEYS = new Set(["_clickedValue", "_clickedColumn"]);

/** The raw query columns a transform stashed under `properties` (#1589). */
function rawColumnsOf(
  row: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const properties = row?.properties;
  if (
    !properties ||
    typeof properties !== "object" ||
    Array.isArray(properties)
  )
    return {};
  return Object.fromEntries(
    Object.entries(properties as Record<string, unknown>).filter(
      ([key]) => !CLICK_CONTROL_KEYS.has(key),
    ),
  );
}

export function useEChartsClick(
  onChartClick: ((point: Record<string, unknown>) => void) | undefined,
  data: unknown,
): ((e: EChartsClickEvent) => void) | undefined {
  return useMemo(() => {
    if (!onChartClick) return undefined;
    return (e: EChartsClickEvent) => {
      const row = Array.isArray(data)
        ? (data[e.dataIndex] as Record<string, unknown> | undefined)
        : undefined;
      // `properties` is the passthrough container, not data — dropping it
      // here stops it shadowing a query column that is itself named
      // `properties`.
      const { properties: _container, ...itemFields } = row ?? {};
      void _container;
      onChartClick({
        // The click-action editor offers every RAW query column as a Source
        // Field, but a transform that rebuilds items from only the fields it
        // detects drops the rest — so the action resolved to `undefined` and
        // was discarded in silence (#1589). Transforms keep the row under
        // `properties`; it goes in first so the transformed fields still win.
        ...rawColumnsOf(row),
        ...itemFields,
        name: e.name,
        value: e.value,
        seriesName: e.seriesName,
        dataIndex: e.dataIndex,
      });
    };
  }, [onChartClick, data]);
}
