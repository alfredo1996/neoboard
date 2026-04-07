/**
 * Chart registry — maps chart type strings to configuration
 * including data transformation functions.
 *
 * SHIM LAYER: Transform and validate functions are now defined in
 * `app/src/plugins/transforms/` and imported here. This module keeps
 * the same public API so existing consumers (card-container,
 * dashboard-container, graph-exploration-wrapper, widget-editor-modal)
 * work unchanged.
 *
 * Phase 2 will make this module delegate to the plugin registry entirely.
 */

import type React from "react";
import type { ColumnMapping } from "@neoboard/components";

export type { ColumnMapping };

export type ChartType =
  | "bar"
  | "line"
  | "pie"
  | "table"
  | "single-value"
  | "graph"
  | "map"
  | "json"
  | "parameter-select"
  | "form"
  | "markdown"
  | "iframe"
  | "gauge"
  | "sankey"
  | "sunburst"
  | "radar"
  | "treemap";

export type { ConnectorType } from "@/lib/connector-types";
import { CONNECTOR_TYPES, type ConnectorType } from "@/lib/connector-types";

export interface ChartConfig {
  type: ChartType;
  label: string;
  transform: (data: unknown) => unknown;
  transformWithMapping: (data: unknown, mapping: ColumnMapping) => unknown;
  /**
   * Lazy component loader for this chart type. Used by chart-renderer
   * to dynamically import the component. Returns a module with a default export.
   *
   * For charts that don't need lazy loading (e.g., JSON, Markdown), this
   * can return the component directly wrapped in `{ default: Component }`.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- props differ per chart type; caller provides correct props
  component?: () => Promise<{ default: React.ComponentType<any> }>;
  /**
   * Validates raw data shape before transform. Returns an error string
   * when data exists but has the wrong shape for this chart type.
   * Returns null when data is valid OR empty (empty = separate "No data" state).
   */
  validate?: (data: unknown) => string | null;
  /**
   * Which connector types can produce data for this chart.
   * If omitted, the chart is compatible with all connector types.
   */
  compatibleWith?: ConnectorType[];
  /**
   * Whether this chart type supports click actions. Defaults to true if omitted.
   * Set to false for chart types where clicking doesn't make sense
   * (e.g. single-value, json, parameter-select).
   */
  supportsClickAction?: boolean;
  /**
   * Whether this chart type supports rule-based styling.
   * Defaults to true if `stylingTargets` is defined, false otherwise.
   * Set to false explicitly for chart types that can't apply conditional
   * colors (json, parameter-select, form).
   */
  supportsStyling?: boolean;
  /** Whether this chart renders via ECharts (used by screenshot capture). */
  isECharts?: boolean;
  /** Whether this chart supports column mapping overlays. */
  supportsColumnMapping?: boolean;
  /** Available styling targets (backgroundColor, textColor, color, etc.). */
  stylingTargets?: { value: string; label: string }[];
  /** Whether this widget type needs a query to render. Defaults to true. */
  requiresQuery?: boolean;
}

// ─── Imports from standalone transform modules ────────────────────────────
import { transformToBarData, validateBarData } from "@/plugins/transforms/bar";
import {
  transformToLineData,
  validateLineData,
} from "@/plugins/transforms/line";
import { transformToPieData, validatePieData } from "@/plugins/transforms/pie";
import { transformToTableData } from "@/plugins/transforms/table";
import {
  transformToValueData,
  validateValueData,
} from "@/plugins/transforms/single-value";
import {
  transformToGraphData,
  validateGraphData,
} from "@/plugins/transforms/graph";
import { transformToMapData, validateMapData } from "@/plugins/transforms/map";
import { transformToJsonData } from "@/plugins/transforms/json";
import { transformToGaugeData } from "@/plugins/transforms/gauge";
import { transformToSankeyData } from "@/plugins/transforms/sankey";
import { transformToHierarchicalData } from "@/plugins/transforms/hierarchical";
import { transformToRadarData } from "@/plugins/transforms/radar";
import { transformToSelectData } from "@/plugins/transforms/parameter-select";

// ─── Registry ─────────────────────────────────────────────────────────────

const COLOR_TARGET = [{ value: "color", label: "Color" }];

// Note: `component` fields below will replace the parallel lazy-loaders in
// chart-renderer.tsx in a follow-up PR. Until then, chart-renderer.tsx owns
// the active loaders at runtime; these registry entries are for future use.
export const chartRegistry: Record<ChartType, ChartConfig> = {
  bar: {
    type: "bar",
    label: "Bar Chart",
    component: () =>
      import("@neoboard/components").then((m) => ({ default: m.BarChart })),
    transform: transformToBarData,
    transformWithMapping: transformToBarData,
    validate: validateBarData,
    compatibleWith: ["neo4j", "postgresql"],
    isECharts: true,
    supportsColumnMapping: true,
    stylingTargets: COLOR_TARGET,
  },
  line: {
    type: "line",
    label: "Line Chart",
    component: () =>
      import("@neoboard/components").then((m) => ({ default: m.LineChart })),
    transform: transformToLineData,
    transformWithMapping: transformToLineData,
    validate: validateLineData,
    compatibleWith: ["neo4j", "postgresql"],
    isECharts: true,
    supportsColumnMapping: true,
    stylingTargets: COLOR_TARGET,
  },
  pie: {
    type: "pie",
    label: "Pie Chart",
    component: () =>
      import("@neoboard/components").then((m) => ({ default: m.PieChart })),
    transform: transformToPieData,
    transformWithMapping: transformToPieData,
    validate: validatePieData,
    compatibleWith: ["neo4j", "postgresql"],
    isECharts: true,
    supportsColumnMapping: true,
    stylingTargets: COLOR_TARGET,
  },
  table: {
    type: "table",
    label: "Data Table",
    component: () =>
      import("@/components/table-renderer").then((m) => ({
        default: m.TableRenderer,
      })),
    transform: transformToTableData,
    transformWithMapping: transformToTableData,
    compatibleWith: ["neo4j", "postgresql"],
    stylingTargets: [
      { value: "backgroundColor", label: "Background Color" },
      { value: "textColor", label: "Text Color" },
    ],
  },
  "single-value": {
    type: "single-value",
    label: "Single Value",
    component: () =>
      import("@neoboard/components").then((m) => ({
        default: m.SingleValueChart,
      })),
    transform: transformToValueData,
    transformWithMapping: transformToValueData,
    validate: validateValueData,
    compatibleWith: ["neo4j", "postgresql"],
    supportsClickAction: false,
    isECharts: true,
    stylingTargets: [
      { value: "color", label: "Text Color" },
      { value: "backgroundColor", label: "Background Color" },
    ],
  },
  graph: {
    type: "graph",
    label: "Graph",
    component: () =>
      import("@neoboard/components").then((m) => ({ default: m.GraphChart })),
    transform: transformToGraphData,
    transformWithMapping: transformToGraphData,
    validate: validateGraphData,
    compatibleWith: ["neo4j"],
    stylingTargets: [{ value: "color", label: "Node Color" }],
  },
  map: {
    type: "map",
    label: "Map",
    component: () =>
      import("@neoboard/components").then((m) => ({ default: m.MapChart })),
    transform: transformToMapData,
    transformWithMapping: transformToMapData,
    validate: validateMapData,
    compatibleWith: ["neo4j", "postgresql"],
    stylingTargets: [{ value: "color", label: "Marker Color" }],
  },
  json: {
    type: "json",
    label: "JSON Viewer",
    component: () =>
      import("@neoboard/components").then((m) => ({ default: m.JsonViewer })),
    transform: transformToJsonData,
    transformWithMapping: transformToJsonData,
    compatibleWith: ["neo4j", "postgresql"],
    supportsClickAction: false,
    supportsStyling: false,
  },
  "parameter-select": {
    type: "parameter-select",
    label: "Parameter Selector",
    component: () =>
      import("@/components/parameter-widget-renderer").then((m) => ({
        default: m.ParameterWidgetRenderer,
      })),
    transform: transformToSelectData,
    transformWithMapping: transformToSelectData,
    compatibleWith: ["neo4j", "postgresql"],
    supportsClickAction: false,
    supportsStyling: false,
    requiresQuery: false,
  },
  form: {
    type: "form",
    label: "Form",
    component: () =>
      import("@/components/form-widget-renderer").then((m) => ({
        default: m.FormWidgetRenderer,
      })),
    transform: () => [],
    transformWithMapping: () => [],
    compatibleWith: ["neo4j", "postgresql"],
    supportsStyling: false,
    requiresQuery: false,
  },
  markdown: {
    type: "markdown",
    label: "Markdown",
    component: () =>
      import("@neoboard/components").then((m) => ({
        default: m.MarkdownWidget,
      })),
    transform: () => null,
    transformWithMapping: () => null,
    compatibleWith: ["neo4j", "postgresql"],
    supportsClickAction: false,
    supportsStyling: false,
    requiresQuery: false,
  },
  iframe: {
    type: "iframe",
    label: "iFrame",
    component: () =>
      import("@neoboard/components").then((m) => ({
        default: m.IframeWidget,
      })),
    transform: () => null,
    transformWithMapping: () => null,
    compatibleWith: ["neo4j", "postgresql"],
    supportsClickAction: false,
    supportsStyling: false,
    requiresQuery: false,
  },
  gauge: {
    type: "gauge",
    label: "Gauge",
    component: () =>
      import("@neoboard/components").then((m) => ({ default: m.GaugeChart })),
    transform: transformToGaugeData,
    transformWithMapping: transformToGaugeData,
    compatibleWith: ["neo4j", "postgresql"],
    supportsClickAction: true,
    isECharts: true,
    stylingTargets: [{ value: "color", label: "Gauge Color" }],
  },
  sankey: {
    type: "sankey",
    label: "Sankey",
    component: () =>
      import("@neoboard/components").then((m) => ({ default: m.SankeyChart })),
    transform: transformToSankeyData,
    transformWithMapping: transformToSankeyData,
    compatibleWith: ["neo4j", "postgresql"],
    isECharts: true,
    stylingTargets: [{ value: "color", label: "Link Color" }],
  },
  sunburst: {
    type: "sunburst",
    label: "Sunburst",
    component: () =>
      import("@neoboard/components").then((m) => ({
        default: m.SunburstChart,
      })),
    transform: transformToHierarchicalData,
    transformWithMapping: transformToHierarchicalData,
    compatibleWith: ["neo4j", "postgresql"],
    isECharts: true,
    stylingTargets: [{ value: "color", label: "Segment Color" }],
  },
  radar: {
    type: "radar",
    label: "Radar",
    component: () =>
      import("@neoboard/components").then((m) => ({ default: m.RadarChart })),
    transform: transformToRadarData,
    transformWithMapping: transformToRadarData,
    compatibleWith: ["neo4j", "postgresql"],
    supportsClickAction: false,
    isECharts: true,
    stylingTargets: [{ value: "color", label: "Area Color" }],
  },
  treemap: {
    type: "treemap",
    label: "Treemap",
    component: () =>
      import("@neoboard/components").then((m) => ({
        default: m.TreemapChart,
      })),
    transform: transformToHierarchicalData,
    transformWithMapping: transformToHierarchicalData,
    compatibleWith: ["neo4j", "postgresql"],
    isECharts: true,
    stylingTargets: [{ value: "color", label: "Block Color" }],
  },
};

export function getChartConfig(type: string): ChartConfig | undefined {
  return chartRegistry[type as ChartType];
}

/**
 * Returns whether a chart type supports click actions.
 * Unknown chart types return false.
 */
export function chartSupportsClickAction(type: string): boolean {
  const config = getChartConfig(type);
  if (!config) return false;
  return config.supportsClickAction !== false;
}

/**
 * Returns whether a chart type supports rule-based styling.
 * Unknown chart types return false.
 */
export function chartSupportsStyling(type: string): boolean {
  const config = getChartConfig(type);
  if (!config) return false;
  return config.supportsStyling !== false;
}

/**
 * Returns empty default chart settings for a type. Used by the widget editor
 * store to initialize chart options without importing the component package.
 * Returns an empty object — the actual defaults are applied at render time
 * by the ChartOptionsPanel component.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getChartDefaults(_type: string): Record<string, unknown> {
  return {};
}

/**
 * Returns the available styling targets for a chart type.
 * Reads from the registry's `stylingTargets` field — no switch statement.
 */
export function getStylingTargets(
  type: string,
): { value: string; label: string }[] {
  const config = getChartConfig(type);
  if (!config || config.supportsStyling === false) return [];
  return config.stylingTargets ?? COLOR_TARGET;
}

/**
 * Returns all ChartTypes compatible with the given connector type.
 *
 * An unknown connectorType string returns an empty array so callers
 * always receive a predictable result (no implicit "show everything").
 */
export function getCompatibleChartTypes(connectorType: string): ChartType[] {
  if (!CONNECTOR_TYPES.includes(connectorType as ConnectorType)) return [];
  const ct = connectorType as ConnectorType;
  return (Object.values(chartRegistry) as ChartConfig[])
    .filter((cfg) => !cfg.compatibleWith || cfg.compatibleWith.includes(ct))
    .map((cfg) => cfg.type);
}
