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
 * The raw query columns a transform stashed under `properties`, minus the
 * control keys `resolve-click-action.ts` presence-tests (`_clickedValue`,
 * `_clickedColumn`) to switch into the table cell-click branch — a user column
 * of that name would reroute the click and then resolve to null (#1589).
 */
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
      ([key]) => !key.startsWith("_clicked"),
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
      onChartClick({
        // The click-action editor offers every RAW query column as a Source
        // Field, but a transform that rebuilds items from only the fields it
        // detects drops the rest — so the action resolved to `undefined` and
        // was discarded in silence (#1589). Transforms keep the row under
        // `properties`; it goes in first so the transformed fields still win.
        ...rawColumnsOf(row),
        ...(row ?? {}),
        name: e.name,
        value: e.value,
        seriesName: e.seriesName,
        dataIndex: e.dataIndex,
      });
    };
  }, [onChartClick, data]);
}
