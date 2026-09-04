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

/**
 * Series whose click event carries the clicked datum itself, because indexing
 * the transformed array by `dataIndex` is wrong for them: ECharts flattens a
 * tree with its synthesized virtual root first (echarts/lib/data/Tree.js), so
 * top-level item i arrives as dataIndex i+1, and sankey's transform output is
 * an object rather than an array so nothing was ever merged (#1596).
 *
 * Keyed on seriesType, never on "is the datum an object": a bar's datum is
 * `{ value, itemStyle }` whenever a styling rule coloured it, and sending bar
 * down this path would drop every raw query column (#1589).
 *
 * `graph` is absent on purpose — the graph widget renders through NVL, and the
 * last ECharts GraphChart registration was removed in #1594, so no ECharts
 * graph-series click can occur.
 */
const DATUM_SERIES = new Set(["sankey", "sunburst", "treemap"]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Build the payload a click action resolves against, or null when the click
 * should fire nothing.
 */
export function buildClickPayload(
  e: EChartsClickEvent,
  data: unknown,
): Record<string, unknown> | null {
  const eventFields = {
    name: e.name,
    value: e.value,
    seriesName: e.seriesName,
    dataIndex: e.dataIndex,
  };

  if (DATUM_SERIES.has(e.seriesType ?? "") && isPlainObject(e.data)) {
    // Only the virtual root has an ancestor chain of length <= 1. Testing
    // `name === ""` instead would silence every real node whose name column
    // was NULL — hierarchical-utils coerces those to "" (#1596).
    if (e.treePathInfo && e.treePathInfo.length <= 1) return null;
    // `children` would drag the whole subtree into a payload of scalars.
    const { children: _children, ...datum } = e.data;
    void _children;
    return { ...datum, ...eventFields };
  }

  const row = Array.isArray(data)
    ? (data[e.dataIndex] as Record<string, unknown> | undefined)
    : undefined;
  // `properties` is the passthrough container, not data — dropping it here
  // stops it shadowing a query column that is itself named `properties`.
  const { properties: _container, ...itemFields } = row ?? {};
  void _container;
  return {
    // The click-action editor offers every RAW query column as a Source
    // Field, but a transform that rebuilds items from only the fields it
    // detects drops the rest — so the action resolved to `undefined` and
    // was discarded in silence (#1589). Transforms keep the row under
    // `properties`; it goes in first so the transformed fields still win.
    ...rawColumnsOf(row),
    ...itemFields,
    ...eventFields,
  };
}

export function useEChartsClick(
  onChartClick: ((point: Record<string, unknown>) => void) | undefined,
  data: unknown,
): ((e: EChartsClickEvent) => void) | undefined {
  return useMemo(() => {
    if (!onChartClick) return undefined;
    return (e: EChartsClickEvent) => {
      const payload = buildClickPayload(e, data);
      if (payload) onChartClick(payload);
    };
  }, [onChartClick, data]);
}
