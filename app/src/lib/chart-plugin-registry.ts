/**
 * Chart plugin registry.
 *
 * Defines the contract for chart plugins and provides a registry for
 * registering + looking them up at runtime. The goal: adding a new chart
 * type requires defining ONE plugin object — no scattered edits across
 * chart-registry, chart-renderer, chart-options, and query hints.
 *
 * A plugin bundles everything a chart type needs:
 *   - React component to render the chart
 *   - Data transform (raw query rows → chart-ready shape)
 *   - Validation (returns error string or null)
 *   - Option schema (drives the Chart Options panel)
 *   - Capabilities flags (click actions, styling, ECharts, etc.)
 *   - Compatibility (which connector types can feed it)
 *
 * Usage:
 *   const barPlugin = defineChartPlugin({
 *     type: "bar",
 *     label: "Bar Chart",
 *     component: BarChart,
 *     transform: transformToBarData,
 *     options: barOptions,
 *     compatibleWith: ["neo4j", "postgresql"],
 *   });
 *
 *   registry.register(barPlugin);
 */

import type React from "react";
import type { z } from "zod";
import type { ConnectorType } from "./connector-types";

// ---------------------------------------------------------------------------
// Chart option definition (duplicated shape from @neoboard/components to
// avoid a cross-package circular dep — plugins live in the app, components
// live in component/).
// ---------------------------------------------------------------------------

export interface ChartOptionDef {
  key: string;
  label: string;
  type: "boolean" | "select" | "text" | "number" | "column-multi-select";
  default: unknown;
  category: string;
  /** Only for type: "select". */
  options?: { label: string; value: string }[];
  /** Tooltip text shown next to the label. */
  description?: string;
}

// ---------------------------------------------------------------------------
// Capability flags — explicit, no "maybe defaults later" ambiguity.
// ---------------------------------------------------------------------------

export interface ChartCapabilities {
  /** Can the user wire click actions to this chart? */
  supportsClickAction: boolean;
  /** Can rule-based styling (color rules) apply? */
  supportsStyling: boolean;
  /** Does it render via ECharts? (used by screenshot capture) */
  isECharts: boolean;
  /** Does this widget need a query to render? (e.g. markdown doesn't) */
  requiresQuery: boolean;
}

// ---------------------------------------------------------------------------
// Plugin configuration (what a plugin author writes)
// ---------------------------------------------------------------------------

export interface ChartPluginConfig {
  /** Unique identifier for this chart type (e.g. "bar", "heatmap"). */
  type: string;
  /** Human-readable name shown in the chart picker. */
  label: string;
  /** React component that renders the chart. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- props vary per chart
  component: React.ComponentType<any>;
  /** Transforms raw query result rows into the chart's data shape. */
  transform: (data: unknown) => unknown;
  /**
   * Transforms raw rows with an explicit column mapping (optional).
   * Used when the user overrides auto-detected axis columns in the UI.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mapping shape lives in component package
  transformWithMapping?: (data: unknown, mapping: any) => unknown;
  /**
   * Validates raw data shape. Returns an error string when data is present
   * but malformed. Returns null for valid or empty data (empty = "No data" state).
   */
  validate?: (data: unknown) => string | null;
  /** Chart-specific options shown in the Chart Options panel. */
  options?: ChartOptionDef[];
  /** Example + column expectations shown to users when they pick this chart. */
  queryHint?: string;
  /** Which connector types can feed this chart. Omit = all connectors. */
  compatibleWith?: ConnectorType[];
  /** Conditional styling targets (e.g. color, backgroundColor). */
  stylingTargets?: { value: string; label: string }[];
  /** Explicit capability overrides. Merged with defaults. */
  capabilities?: Partial<ChartCapabilities>;
  /** Zod schema for this plugin's settings. Enables typed access in components. */
  settingsSchema?: z.ZodType;
  /**
   * Optional click event enricher — lets the plugin attach chart-specific
   * fields to the click event before handlers see it (e.g. attach the
   * original row for rule resolution).
   */
  enrichClickEvent?: (
    event: Record<string, unknown>,
    row: Record<string, unknown>,
  ) => Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Resolved plugin (what the registry stores — capabilities always present)
// ---------------------------------------------------------------------------

export interface ChartPlugin extends Omit<ChartPluginConfig, "capabilities"> {
  capabilities: ChartCapabilities;
}

// ---------------------------------------------------------------------------
// defineChartPlugin — normalizes config, applies defaults, validates
// ---------------------------------------------------------------------------

const DEFAULT_CAPABILITIES: ChartCapabilities = {
  supportsClickAction: true,
  supportsStyling: false,
  isECharts: false,
  requiresQuery: true,
};

export function defineChartPlugin(config: ChartPluginConfig): ChartPlugin {
  // Validation
  if (!config.type || config.type.trim() === "") {
    throw new Error("Chart plugin: type is required and cannot be empty");
  }
  if (!config.label || config.label.trim() === "") {
    throw new Error("Chart plugin: label is required and cannot be empty");
  }
  if (typeof config.transform !== "function") {
    throw new Error("Chart plugin: transform must be a function");
  }

  // supportsStyling defaults to true if stylingTargets is provided, false otherwise
  const stylingFromTargets =
    config.stylingTargets && config.stylingTargets.length > 0;

  const capabilities: ChartCapabilities = {
    ...DEFAULT_CAPABILITIES,
    ...(stylingFromTargets ? { supportsStyling: true } : {}),
    ...config.capabilities,
  };

  return {
    type: config.type,
    label: config.label,
    component: config.component,
    transform: config.transform,
    transformWithMapping: config.transformWithMapping,
    validate: config.validate,
    options: config.options ?? [],
    queryHint: config.queryHint,
    compatibleWith: config.compatibleWith,
    stylingTargets: config.stylingTargets,
    enrichClickEvent: config.enrichClickEvent,
    settingsSchema: config.settingsSchema,
    capabilities,
  };
}

// ---------------------------------------------------------------------------
// Plugin registry
// ---------------------------------------------------------------------------

export interface PluginRegistry {
  register(plugin: ChartPlugin): void;
  unregister(type: string): void;
  get(type: string): ChartPlugin | undefined;
  has(type: string): boolean;
  getAll(): ChartPlugin[];
  getTypes(): string[];
  getCompatibleWith(connectorType: ConnectorType): ChartPlugin[];
}

export function createPluginRegistry(): PluginRegistry {
  const plugins = new Map<string, ChartPlugin>();

  return {
    register(plugin) {
      if (plugins.has(plugin.type)) {
        throw new Error(
          `Chart plugin "${plugin.type}" is already registered. ` +
            `Call unregister("${plugin.type}") first if you want to replace it.`,
        );
      }
      plugins.set(plugin.type, plugin);
    },
    unregister(type) {
      plugins.delete(type);
    },
    get(type) {
      return plugins.get(type);
    },
    has(type) {
      return plugins.has(type);
    },
    getAll() {
      return Array.from(plugins.values());
    },
    getTypes() {
      return Array.from(plugins.keys());
    },
    getCompatibleWith(connectorType) {
      return Array.from(plugins.values()).filter(
        (p) => !p.compatibleWith || p.compatibleWith.includes(connectorType),
      );
    },
  };
}
