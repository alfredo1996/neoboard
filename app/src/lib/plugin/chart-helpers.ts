/**
 * Chart helper functions — thin wrappers around the plugin registry.
 *
 * These replace the legacy chart-registry.ts helpers with direct
 * delegation to `pluginRegistry`. Consumers that previously imported
 * from `@/lib/chart-registry` should import from here instead.
 *
 * Importing this module has the side effect of registering lightweight
 * (stub) plugins when the full plugin modules haven't loaded yet. At
 * runtime, `plugins/index.ts` replaces these stubs with real
 * components; but for tests that never import full plugins, the stubs
 * provide enough metadata for helper functions to work.
 */

import { pluginRegistry } from "@/plugins/registry";
import { defineChartPlugin } from "@/lib/plugin/chart-plugin-registry";
import type { ChartPlugin } from "@/lib/plugin/chart-plugin-registry";
import {
  CONNECTOR_TYPES,
  type ConnectorType,
} from "@/lib/connector/connector-types";

// Re-export types for backward compatibility
export type { ChartType } from "@/plugins/chart-types";
export { CHART_TYPES } from "@/plugins/chart-types";
export type { ConnectorType } from "@/lib/connector/connector-types";
export type { ColumnMapping } from "@neoboard/components";
export type { ChartPlugin };

// ---------------------------------------------------------------------------
// Column mapping support — hardcoded set of types that support it.
// ---------------------------------------------------------------------------

const COLUMN_MAPPING_TYPES = new Set<string>(["bar", "line", "pie"]);

/**
 * Chart types disabled in the picker (#1158) — "ship less, but better".
 * Their plugins stay REGISTERED so existing dashboards keep rendering; they're
 * just filtered out of the new-widget / change-type list. To re-enable one,
 * remove it here — no other change needed.
 */
export const DISABLED_CHART_TYPES: ReadonlySet<string> = new Set([
  "circle-packing",
  "treemap",
  "choropleth",
  "radar",
]);

// ---------------------------------------------------------------------------
// Lightweight plugin registration (no React component imports)
//
// Ensures that helper functions return correct capability information
// even before the full plugin modules (with React components) load.
// At app startup, `plugins/index.ts` replaces stubs with real plugins.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- stub placeholder
const StubComponent: React.ComponentType<any> = (() => null) as any;
const identity = (d: unknown) => d;
const nullTransform = () => null;

interface LightDef {
  type: string;
  label: string;
  compatibleWith?: ConnectorType[];
  stylingTargets?: { value: string; label: string }[];
  capabilities?: {
    supportsClickAction?: boolean;
    supportsStyling?: boolean;
    isECharts?: boolean;
    requiresQuery?: boolean;
  };
}

const LIGHTWEIGHT_DEFS: LightDef[] = [
  {
    type: "bar",
    label: "Bar Chart",
    compatibleWith: ["neo4j", "postgresql"],
    stylingTargets: [{ value: "color", label: "Bar Color" }],
    capabilities: { isECharts: true, supportsStyling: true },
  },
  {
    type: "line",
    label: "Line Chart",
    compatibleWith: ["neo4j", "postgresql"],
    stylingTargets: [{ value: "color", label: "Line Color" }],
    capabilities: { isECharts: true, supportsStyling: true },
  },
  {
    type: "pie",
    label: "Pie Chart",
    compatibleWith: ["neo4j", "postgresql"],
    stylingTargets: [{ value: "color", label: "Slice Color" }],
    capabilities: { isECharts: true, supportsStyling: true },
  },
  {
    type: "table",
    label: "Data Table",
    compatibleWith: ["neo4j", "postgresql"],
    stylingTargets: [
      { value: "backgroundColor", label: "Background Color" },
      { value: "textColor", label: "Text Color" },
    ],
    capabilities: { supportsStyling: true },
  },
  {
    type: "single-value",
    label: "Single Value",
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
  },
  {
    type: "graph",
    label: "Graph",
    compatibleWith: ["neo4j"],
    stylingTargets: [{ value: "color", label: "Node Color" }],
    capabilities: { supportsStyling: true },
  },
  {
    type: "map",
    label: "Map",
    compatibleWith: ["neo4j", "postgresql"],
    stylingTargets: [{ value: "color", label: "Marker Color" }],
    capabilities: { supportsStyling: true },
  },
  {
    type: "json",
    label: "JSON Viewer",
    compatibleWith: ["neo4j", "postgresql"],
    capabilities: { supportsClickAction: false, supportsStyling: false },
  },
  {
    type: "parameter-select",
    label: "Parameter Selector",
    compatibleWith: ["neo4j", "postgresql"],
    capabilities: {
      supportsClickAction: false,
      supportsStyling: false,
      requiresQuery: false,
    },
  },
  {
    type: "form",
    label: "Form",
    compatibleWith: ["neo4j", "postgresql"],
    capabilities: { supportsStyling: false, requiresQuery: false },
  },
  {
    type: "markdown",
    label: "Markdown",
    compatibleWith: ["neo4j", "postgresql"],
    capabilities: {
      supportsClickAction: false,
      supportsStyling: false,
      requiresQuery: false,
    },
  },
  {
    type: "iframe",
    label: "iFrame",
    compatibleWith: ["neo4j", "postgresql"],
    capabilities: {
      supportsClickAction: false,
      supportsStyling: false,
      requiresQuery: false,
    },
  },
  {
    type: "gauge",
    label: "Gauge",
    compatibleWith: ["neo4j", "postgresql"],
    stylingTargets: [{ value: "color", label: "Gauge Color" }],
    capabilities: { isECharts: true, supportsStyling: true },
  },
  {
    type: "sankey",
    label: "Sankey",
    compatibleWith: ["neo4j", "postgresql"],
    stylingTargets: [{ value: "color", label: "Link Color" }],
    capabilities: { isECharts: true, supportsStyling: true },
  },
  {
    type: "sunburst",
    label: "Sunburst",
    compatibleWith: ["neo4j", "postgresql"],
    stylingTargets: [{ value: "color", label: "Segment Color" }],
    capabilities: { isECharts: true, supportsStyling: true },
  },
  {
    type: "radar",
    label: "Radar",
    compatibleWith: ["neo4j", "postgresql"],
    stylingTargets: [{ value: "color", label: "Area Color" }],
    capabilities: {
      supportsClickAction: false,
      isECharts: true,
      supportsStyling: true,
    },
  },
  {
    type: "treemap",
    label: "Treemap",
    compatibleWith: ["neo4j", "postgresql"],
    stylingTargets: [{ value: "color", label: "Block Color" }],
    capabilities: { isECharts: true, supportsStyling: true },
  },
];

for (const def of LIGHTWEIGHT_DEFS) {
  if (!pluginRegistry.has(def.type)) {
    pluginRegistry.register(
      defineChartPlugin({
        type: def.type,
        label: def.label,
        component: StubComponent,
        transform:
          def.type === "markdown" || def.type === "iframe"
            ? nullTransform
            : identity,
        transformWithMapping:
          def.type === "markdown" || def.type === "iframe"
            ? nullTransform
            : identity,
        compatibleWith: def.compatibleWith,
        stylingTargets: def.stylingTargets,
        capabilities: def.capabilities,
      }),
    );
  }
}

/**
 * Validate that registered plugins match LIGHTWEIGHT_DEFS expectations.
 * Call after all real plugins have registered to catch capability drift.
 * Runs only in development — skipped in production and tests.
 */
export function validatePluginStubSync(): void {
  if (
    typeof process !== "undefined" &&
    (process.env.NODE_ENV === "production" || process.env.NODE_ENV === "test")
  ) {
    return;
  }
  for (const def of LIGHTWEIGHT_DEFS) {
    const real = pluginRegistry.get(def.type);
    if (!real) continue; // Not registered yet — will be caught by startup validation

    // Check capability mismatches between stub definition and real plugin
    if (def.capabilities) {
      const stubCaps = def.capabilities;
      const realCaps = real.capabilities;
      if (
        stubCaps.isECharts !== undefined &&
        stubCaps.isECharts !== realCaps.isECharts
      ) {
        console.warn(
          '[plugin-sync] "' +
            def.type +
            '": stub says isECharts=' +
            stubCaps.isECharts +
            " but real plugin has " +
            realCaps.isECharts,
        );
      }
      if (
        stubCaps.supportsStyling !== undefined &&
        stubCaps.supportsStyling !== realCaps.supportsStyling
      ) {
        console.warn(
          '[plugin-sync] "' +
            def.type +
            '": stub says supportsStyling=' +
            stubCaps.supportsStyling +
            " but real plugin has " +
            realCaps.supportsStyling,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Get a chart plugin by type. Returns undefined if not registered.
 */
export function getChartConfig(type: string): ChartPlugin | undefined {
  return pluginRegistry.get(type);
}

/**
 * Check whether a chart type supports click actions.
 */
export function chartSupportsClickAction(type: string): boolean {
  return pluginRegistry.get(type)?.capabilities.supportsClickAction ?? false;
}

/**
 * Check whether a chart type supports rule-based styling.
 */
export function chartSupportsStyling(type: string): boolean {
  return pluginRegistry.get(type)?.capabilities.supportsStyling ?? false;
}

/**
 * Get the styling targets for a chart type.
 * Returns an empty array if the type doesn't support styling.
 */
export function getStylingTargets(
  type: string,
): { value: string; label: string }[] {
  const plugin = pluginRegistry.get(type);
  if (!plugin?.capabilities.supportsStyling) return [];
  return plugin.stylingTargets ?? [{ value: "color", label: "Color" }];
}

/**
 * Get all chart types compatible with a given connector type.
 */
export function getCompatibleChartTypes(connectorType: string): string[] {
  if (!CONNECTOR_TYPES.includes(connectorType as ConnectorType)) return [];
  return pluginRegistry
    .getCompatibleWith(connectorType as ConnectorType)
    .map((p) => p.type)
    .filter((t) => !DISABLED_CHART_TYPES.has(t));
}

/**
 * Check whether a chart type requires a query to render.
 */
export function chartRequiresQuery(type: string): boolean {
  return pluginRegistry.get(type)?.capabilities.requiresQuery ?? true;
}

/**
 * Get default chart settings for a chart type.
 * Returns an empty object — defaults are managed by Zod schemas in plugins.
 */
export function getChartDefaults(type: string): Record<string, unknown> {
  const plugin = pluginRegistry.get(type);
  if (plugin?.settingsSchema) {
    try {
      // Parse empty object through the Zod schema to extract defaults
      return plugin.settingsSchema.parse({}) as Record<string, unknown>;
    } catch {
      // Schema requires fields — can't extract defaults
    }
  }
  return {};
}

/**
 * Check whether a chart type supports column mapping.
 * Uses the plugin's transformWithMapping function as the signal —
 * if a plugin provides it, column mapping is supported.
 * Falls back to the hardcoded set for plugins that haven't adopted yet.
 */
export function supportsColumnMapping(type: string): boolean {
  const plugin = pluginRegistry.get(type);
  if (plugin) {
    return typeof plugin.transformWithMapping === "function";
  }
  return COLUMN_MAPPING_TYPES.has(type);
}

/**
 * Get all registered chart types as strings.
 */
export function getAllChartTypes(): string[] {
  return pluginRegistry.getTypes();
}
