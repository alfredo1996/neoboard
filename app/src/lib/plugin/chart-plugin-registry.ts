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
 *     requires: ["graphData"],
 *   });
 *
 *   registry.register(barPlugin);
 */

import type React from "react";
import type { z } from "zod";

// ---------------------------------------------------------------------------
// Chart option definition (duplicated shape from @neoboard/components to
// avoid a cross-package circular dep — plugins live in the app, components
// live in component/).
// ---------------------------------------------------------------------------

export interface ChartOptionDef {
  key: string;
  label: string;
  type:
    | "boolean"
    | "select"
    | "text"
    | "textarea"
    | "number"
    | "column-multi-select";
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
  // ColumnMapping shape: { xAxis?, yAxis?, groupBy? } from component package.
  // Using a loose type here to avoid coupling the registry to the component package.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ColumnMapping lives in component package
  transformWithMapping?: (data: unknown, mapping: any) => unknown;
  /**
   * Validates raw data shape. Returns an error string when data is present
   * but malformed. Returns null for valid or empty data (empty = "No data" state).
   *
   * Receives the same mapping as `transformWithMapping` so a validator can
   * check the columns that will actually be plotted. Without it, a validator
   * has to assume positional defaults and would wrongly reject a result whose
   * text columns the user had already mapped away (#1400).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ColumnMapping lives in component package
  validate?: (data: unknown, mapping?: any) => string | null;
  /** Chart-specific options shown in the Chart Options panel. */
  options?: ChartOptionDef[];
  /** Example + column expectations shown to users when they pick this chart. */
  queryHint?: string;
  /**
   * What this chart needs a connector to be able to return. Omit = nothing in
   * particular, which is every chart but one (#1902).
   *
   * A requirement names a CAPABILITY, never a connector: the question "can
   * this connection feed a graph chart?" is answered by what the connector
   * declares it returns, not by a list of connector names kept in the app.
   */
  requires?: ChartRequirement[];
  /** Conditional styling targets (e.g. color, backgroundColor). */
  stylingTargets?: { value: string; label: string }[];
  /** Explicit capability overrides. Merged with defaults. */
  capabilities?: Partial<ChartCapabilities>;
  /** Zod schema for this plugin's settings. Enables typed access in components. */
  settingsSchema?: z.ZodType<Record<string, unknown>>;
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

/**
 * What a chart can require of a connector. One entry today; the point is that
 * the list is a vocabulary the app owns, and a connector answers it — rather
 * than the app keeping a list of which connectors exist (#1902).
 */
export const CHART_REQUIREMENTS = ["graphData"] as const;
export type ChartRequirement = (typeof CHART_REQUIREMENTS)[number];

/** A connector's answers, keyed by requirement. */
export type ChartCapabilityFlags = Partial<Record<ChartRequirement, boolean>>;

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
  // ── Validation ──────────────────────────────────────────────────────
  if (!config.type || config.type.trim() === "") {
    throw new Error("Chart plugin: type is required and cannot be empty");
  }
  if (!config.label || config.label.trim() === "") {
    throw new Error("Chart plugin: label is required and cannot be empty");
  }
  if (typeof config.transform !== "function") {
    throw new Error("Chart plugin: transform must be a function");
  }

  // Validate options shape if provided
  if (config.options) {
    for (const opt of config.options) {
      if (!opt.key || !opt.label || !opt.type) {
        console.warn(
          'Chart plugin "' + config.type + '": option missing key/label/type:',
          opt,
        );
      }
    }
  }

  // Validate requirements — a typo here silently hides a chart from every
  // connection, which looks like the chart was never registered.
  for (const requirement of config.requires ?? []) {
    if (!CHART_REQUIREMENTS.includes(requirement)) {
      console.warn(
        'Chart plugin "' + config.type + '": unknown requirement:',
        requirement,
      );
    }
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
    requires: config.requires,
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
  getCompatibleWith(capabilities: ChartCapabilityFlags): ChartPlugin[];
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
    getCompatibleWith(capabilities) {
      return Array.from(plugins.values()).filter((p) =>
        (p.requires ?? []).every((r) => capabilities[r]),
      );
    },
  };
}
