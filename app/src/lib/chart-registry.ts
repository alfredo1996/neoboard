/**
 * Chart registry — thin shim that delegates to the plugin registry.
 *
 * This module registers lightweight plugin entries (transforms + metadata
 * only, no React component imports) with the global `pluginRegistry` and
 * then exposes the legacy `ChartConfig` API via a Proxy. The actual
 * plugin `.tsx` files (with full React components) are registered
 * separately by `plugins/index.ts` at app startup via `chart-renderer`.
 *
 * This two-tier registration ensures:
 *   1. Tests that import chart-registry don't pull in React component trees
 *   2. Runtime app code gets the full plugin components
 *
 * Public API surface (all preserved for backward compatibility):
 *   - ChartType (re-exported from plugins/chart-types.ts)
 *   - ChartConfig interface
 *   - chartRegistry object (Proxy delegating to pluginRegistry)
 *   - getChartConfig(type)
 *   - chartSupportsClickAction(type)
 *   - chartSupportsStyling(type)
 *   - getStylingTargets(type)
 *   - getCompatibleChartTypes(connectorType)
 *   - getChartDefaults(type)
 */

import type React from "react";
import type { ColumnMapping } from "@neoboard/components";
import type { ChartPlugin } from "@/lib/chart-plugin-registry";
import { defineChartPlugin } from "@/lib/chart-plugin-registry";
import { pluginRegistry } from "@/plugins/registry";

export type { ColumnMapping };
export type { ChartType } from "@/plugins/chart-types";
export type { ConnectorType } from "@/lib/connector-types";

import type { ChartType } from "@/plugins/chart-types";
import { CONNECTOR_TYPES, type ConnectorType } from "@/lib/connector-types";

// ─── Imports from standalone transform modules (pure TS, no React) ───────────
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

// ─── ChartConfig interface (legacy shape consumed by card-container etc.) ─────

export interface ChartConfig {
  type: ChartType;
  label: string;
  transform: (data: unknown) => unknown;
  transformWithMapping: (data: unknown, mapping: ColumnMapping) => unknown;
  /**
   * Lazy component loader for this chart type. Returns a module with
   * a default export.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- props differ per chart type
  component?: () => Promise<{ default: React.ComponentType<any> }>;
  validate?: (data: unknown) => string | null;
  compatibleWith?: ConnectorType[];
  supportsClickAction?: boolean;
  supportsStyling?: boolean;
  isECharts?: boolean;
  supportsColumnMapping?: boolean;
  stylingTargets?: { value: string; label: string }[];
  requiresQuery?: boolean;
}

// ─── Lightweight plugin registrations ────────────────────────────────────────
// These use a stub component so they can be registered synchronously without
// importing React component trees. At app startup, `plugins/index.ts`
// replaces these with full plugin registrations that include real components.

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- stub placeholder for lightweight registration
const StubComponent: React.ComponentType<any> = (() => null) as any;

const COLOR_TARGET = [{ value: "color", label: "Color" }];

interface LightweightPluginDef {
  type: string;
  label: string;
  transform: (data: unknown) => unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mapping type varies per chart; ColumnMapping is the runtime shape
  transformWithMapping?: (data: unknown, mapping?: any) => unknown;
  validate?: (data: unknown) => string | null;
  compatibleWith?: ConnectorType[];
  stylingTargets?: { value: string; label: string }[];
  capabilities?: {
    supportsClickAction?: boolean;
    supportsStyling?: boolean;
    isECharts?: boolean;
    requiresQuery?: boolean;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- lazy loader shape
  componentLoader?: () => Promise<{ default: React.ComponentType<any> }>;
}

const LIGHTWEIGHT_DEFS: LightweightPluginDef[] = [
  {
    type: "bar",
    label: "Bar Chart",
    transform: transformToBarData,
    transformWithMapping: transformToBarData,
    validate: validateBarData,
    compatibleWith: ["neo4j", "postgresql"],
    stylingTargets: COLOR_TARGET,
    capabilities: { isECharts: true, supportsStyling: true },
    componentLoader: () =>
      import("@neoboard/components").then((m) => ({ default: m.BarChart })),
  },
  {
    type: "line",
    label: "Line Chart",
    transform: transformToLineData,
    transformWithMapping: transformToLineData,
    validate: validateLineData,
    compatibleWith: ["neo4j", "postgresql"],
    stylingTargets: COLOR_TARGET,
    capabilities: { isECharts: true, supportsStyling: true },
    componentLoader: () =>
      import("@neoboard/components").then((m) => ({ default: m.LineChart })),
  },
  {
    type: "pie",
    label: "Pie Chart",
    transform: transformToPieData,
    transformWithMapping: transformToPieData,
    validate: validatePieData,
    compatibleWith: ["neo4j", "postgresql"],
    stylingTargets: COLOR_TARGET,
    capabilities: { isECharts: true, supportsStyling: true },
    componentLoader: () =>
      import("@neoboard/components").then((m) => ({ default: m.PieChart })),
  },
  {
    type: "table",
    label: "Data Table",
    transform: transformToTableData,
    transformWithMapping: transformToTableData,
    compatibleWith: ["neo4j", "postgresql"],
    stylingTargets: [
      { value: "backgroundColor", label: "Background Color" },
      { value: "textColor", label: "Text Color" },
    ],
    capabilities: { supportsStyling: true },
    componentLoader: () =>
      import("@/components/table-renderer").then((m) => ({
        default: m.TableRenderer,
      })),
  },
  {
    type: "single-value",
    label: "Single Value",
    transform: transformToValueData,
    transformWithMapping: transformToValueData,
    validate: validateValueData,
    compatibleWith: ["neo4j", "postgresql"],
    stylingTargets: [
      { value: "color", label: "Text Color" },
      { value: "backgroundColor", label: "Background Color" },
    ],
    capabilities: {
      supportsClickAction: false,
      isECharts: true,
      supportsStyling: true,
    },
    componentLoader: () =>
      import("@neoboard/components").then((m) => ({
        default: m.SingleValueChart,
      })),
  },
  {
    type: "graph",
    label: "Graph",
    transform: transformToGraphData,
    transformWithMapping: transformToGraphData,
    validate: validateGraphData,
    compatibleWith: ["neo4j"],
    stylingTargets: [{ value: "color", label: "Node Color" }],
    capabilities: { supportsStyling: true },
    componentLoader: () =>
      import("@neoboard/components").then((m) => ({ default: m.GraphChart })),
  },
  {
    type: "map",
    label: "Map",
    transform: transformToMapData,
    transformWithMapping: transformToMapData,
    validate: validateMapData,
    compatibleWith: ["neo4j", "postgresql"],
    stylingTargets: [{ value: "color", label: "Marker Color" }],
    capabilities: { supportsStyling: true },
    componentLoader: () =>
      import("@neoboard/components").then((m) => ({ default: m.MapChart })),
  },
  {
    type: "json",
    label: "JSON Viewer",
    transform: transformToJsonData,
    transformWithMapping: transformToJsonData,
    compatibleWith: ["neo4j", "postgresql"],
    capabilities: {
      supportsClickAction: false,
      supportsStyling: false,
    },
    componentLoader: () =>
      import("@neoboard/components").then((m) => ({ default: m.JsonViewer })),
  },
  {
    type: "parameter-select",
    label: "Parameter Selector",
    transform: transformToSelectData,
    transformWithMapping: transformToSelectData,
    compatibleWith: ["neo4j", "postgresql"],
    capabilities: {
      supportsClickAction: false,
      supportsStyling: false,
      requiresQuery: false,
    },
    componentLoader: () =>
      import("@/components/parameter-widget-renderer").then((m) => ({
        default: m.ParameterWidgetRenderer,
      })),
  },
  {
    type: "form",
    label: "Form",
    transform: () => [],
    transformWithMapping: () => [],
    compatibleWith: ["neo4j", "postgresql"],
    capabilities: {
      supportsStyling: false,
      requiresQuery: false,
    },
    componentLoader: () =>
      import("@/components/form-widget-renderer").then((m) => ({
        default: m.FormWidgetRenderer,
      })),
  },
  {
    type: "markdown",
    label: "Markdown",
    transform: () => null,
    transformWithMapping: () => null,
    compatibleWith: ["neo4j", "postgresql"],
    capabilities: {
      supportsClickAction: false,
      supportsStyling: false,
      requiresQuery: false,
    },
    componentLoader: () =>
      import("@neoboard/components").then((m) => ({
        default: m.MarkdownWidget,
      })),
  },
  {
    type: "iframe",
    label: "iFrame",
    transform: () => null,
    transformWithMapping: () => null,
    compatibleWith: ["neo4j", "postgresql"],
    capabilities: {
      supportsClickAction: false,
      supportsStyling: false,
      requiresQuery: false,
    },
    componentLoader: () =>
      import("@neoboard/components").then((m) => ({
        default: m.IframeWidget,
      })),
  },
  {
    type: "gauge",
    label: "Gauge",
    transform: transformToGaugeData,
    transformWithMapping: transformToGaugeData,
    compatibleWith: ["neo4j", "postgresql"],
    stylingTargets: [{ value: "color", label: "Gauge Color" }],
    capabilities: {
      supportsClickAction: true,
      isECharts: true,
      supportsStyling: true,
    },
    componentLoader: () =>
      import("@neoboard/components").then((m) => ({ default: m.GaugeChart })),
  },
  {
    type: "sankey",
    label: "Sankey",
    transform: transformToSankeyData,
    transformWithMapping: transformToSankeyData,
    compatibleWith: ["neo4j", "postgresql"],
    stylingTargets: [{ value: "color", label: "Link Color" }],
    capabilities: { isECharts: true, supportsStyling: true },
    componentLoader: () =>
      import("@neoboard/components").then((m) => ({ default: m.SankeyChart })),
  },
  {
    type: "sunburst",
    label: "Sunburst",
    transform: transformToHierarchicalData,
    transformWithMapping: transformToHierarchicalData,
    compatibleWith: ["neo4j", "postgresql"],
    stylingTargets: [{ value: "color", label: "Segment Color" }],
    capabilities: { isECharts: true, supportsStyling: true },
    componentLoader: () =>
      import("@neoboard/components").then((m) => ({
        default: m.SunburstChart,
      })),
  },
  {
    type: "radar",
    label: "Radar",
    transform: transformToRadarData,
    transformWithMapping: transformToRadarData,
    compatibleWith: ["neo4j", "postgresql"],
    stylingTargets: [{ value: "color", label: "Area Color" }],
    capabilities: {
      supportsClickAction: false,
      isECharts: true,
      supportsStyling: true,
    },
    componentLoader: () =>
      import("@neoboard/components").then((m) => ({ default: m.RadarChart })),
  },
  {
    type: "treemap",
    label: "Treemap",
    transform: transformToHierarchicalData,
    transformWithMapping: transformToHierarchicalData,
    compatibleWith: ["neo4j", "postgresql"],
    stylingTargets: [{ value: "color", label: "Block Color" }],
    capabilities: { isECharts: true, supportsStyling: true },
    componentLoader: () =>
      import("@neoboard/components").then((m) => ({
        default: m.TreemapChart,
      })),
  },
];

// Register lightweight plugins (idempotent — skips if already registered
// by the full plugin modules in plugins/index.ts).
for (const def of LIGHTWEIGHT_DEFS) {
  if (!pluginRegistry.has(def.type)) {
    pluginRegistry.register(
      defineChartPlugin({
        type: def.type,
        label: def.label,
        component: StubComponent,
        transform: def.transform,
        transformWithMapping: def.transformWithMapping,
        validate: def.validate,
        compatibleWith: def.compatibleWith,
        stylingTargets: def.stylingTargets,
        capabilities: def.capabilities,
      }),
    );
  }
}

// Map from type → dynamic component loader for the ChartConfig adapter.
const componentLoaders = new Map<
  string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  () => Promise<{ default: React.ComponentType<any> }>
>();
for (const def of LIGHTWEIGHT_DEFS) {
  if (def.componentLoader) {
    componentLoaders.set(def.type, def.componentLoader);
  }
}

// ─── Plugin → ChartConfig adapter ────────────────────────────────────────────

const DEFAULT_COLOR_TARGET = [{ value: "color", label: "Color" }];

const COLUMN_MAPPING_TYPES = new Set<string>(["bar", "line", "pie"]);

function adaptPlugin(plugin: ChartPlugin): ChartConfig {
  const loader = componentLoaders.get(plugin.type);
  return {
    type: plugin.type as ChartType,
    label: plugin.label,
    transform: plugin.transform,
    transformWithMapping: plugin.transformWithMapping ?? plugin.transform,
    component: loader ?? (() => Promise.resolve({ default: plugin.component })),
    validate: plugin.validate,
    compatibleWith: plugin.compatibleWith,
    supportsClickAction: plugin.capabilities.supportsClickAction,
    supportsStyling: plugin.capabilities.supportsStyling,
    isECharts: plugin.capabilities.isECharts,
    supportsColumnMapping: COLUMN_MAPPING_TYPES.has(plugin.type),
    stylingTargets: plugin.stylingTargets,
    requiresQuery: plugin.capabilities.requiresQuery,
  };
}

// ─── chartRegistry proxy ─────────────────────────────────────────────────────

export const chartRegistry: Record<ChartType, ChartConfig> = new Proxy(
  {} as Record<ChartType, ChartConfig>,
  {
    get(_target, prop: string) {
      const plugin = pluginRegistry.get(prop);
      if (!plugin) return undefined;
      return adaptPlugin(plugin);
    },
    has(_target, prop: string) {
      return pluginRegistry.has(prop);
    },
    ownKeys() {
      return pluginRegistry.getTypes();
    },
    getOwnPropertyDescriptor(_target, prop: string) {
      if (pluginRegistry.has(prop)) {
        return {
          configurable: true,
          enumerable: true,
          writable: false,
          value: adaptPlugin(pluginRegistry.get(prop)!),
        };
      }
      return undefined;
    },
  },
);

// ─── Helper functions ────────────────────────────────────────────────────────

export function getChartConfig(type: string): ChartConfig | undefined {
  const plugin = pluginRegistry.get(type);
  if (!plugin) return undefined;
  return adaptPlugin(plugin);
}

export function chartSupportsClickAction(type: string): boolean {
  const plugin = pluginRegistry.get(type);
  if (!plugin) return false;
  return plugin.capabilities.supportsClickAction;
}

export function chartSupportsStyling(type: string): boolean {
  const plugin = pluginRegistry.get(type);
  if (!plugin) return false;
  return plugin.capabilities.supportsStyling;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getChartDefaults(_type: string): Record<string, unknown> {
  return {};
}

export function getStylingTargets(
  type: string,
): { value: string; label: string }[] {
  const plugin = pluginRegistry.get(type);
  if (!plugin || !plugin.capabilities.supportsStyling) return [];
  return plugin.stylingTargets ?? DEFAULT_COLOR_TARGET;
}

export function getCompatibleChartTypes(connectorType: string): ChartType[] {
  if (!CONNECTOR_TYPES.includes(connectorType as ConnectorType)) return [];
  const ct = connectorType as ConnectorType;
  return pluginRegistry.getCompatibleWith(ct).map((p) => p.type as ChartType);
}
