import { COLOR_PALETTES } from "@/charts/palettes";

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
  /** Only for type: "select" */
  options?: { label: string; value: string }[];
  /** Short description shown in a tooltip next to the option label. */
  description?: string;
  /**
   * Optional client-side validation for text inputs. Returns null when the
   * value is acceptable, or a severity + message to show inline (#1053).
   */
  validate?: (
    value: string,
  ) => { level: "error" | "warning"; message: string } | null;
}

// ---------------------------------------------------------------------------
// Shared option constants — reused across multiple chart type definitions
// to avoid duplication.
// ---------------------------------------------------------------------------

export const SHARED_SHOW_LEGEND: ChartOptionDef = {
  key: "showLegend",
  label: "Show Legend",
  type: "boolean",
  default: true,
  category: "Labels",
  description: "Show the chart legend identifying each data series.",
};

export const SHARED_LEGEND_POSITION: ChartOptionDef = {
  key: "legendPosition",
  label: "Legend Position",
  type: "select",
  default: "bottom",
  category: "Labels",
  description: "Where to place the legend relative to the chart.",
  options: [
    { label: "Bottom", value: "bottom" },
    { label: "Top", value: "top" },
    { label: "Left", value: "left" },
    { label: "Right", value: "right" },
  ],
};

export const SHARED_X_AXIS_LABEL: ChartOptionDef = {
  key: "xAxisLabel",
  label: "X-Axis Label",
  type: "text",
  default: "",
  category: "Labels",
  description: "Custom label displayed below the horizontal axis.",
};

export const SHARED_Y_AXIS_LABEL: ChartOptionDef = {
  key: "yAxisLabel",
  label: "Y-Axis Label",
  type: "text",
  default: "",
  category: "Labels",
  description: "Custom label displayed beside the vertical axis.",
};

export const SHARED_SHOW_GRID_LINES: ChartOptionDef = {
  key: "showGridLines",
  label: "Show Grid Lines",
  type: "boolean",
  default: true,
  category: "Style",
  description: "Show faint horizontal reference lines behind the chart.",
};

export const SHARED_REFERENCE_LINES: ChartOptionDef = {
  key: "referenceLines",
  label: "Reference Lines (JSON)",
  type: "text",
  default: "",
  category: "Annotations",
  description:
    'Horizontal reference lines as JSON: [{"value":50,"label":"Target","color":"#ff0000"}]',
};

export const SHARED_SHOW_LABELS: ChartOptionDef = {
  key: "showLabels",
  label: "Show Labels",
  type: "boolean",
  default: true,
  category: "Labels",
  description: "Show the name label on each element.",
};

/** DataZoom option for axis-based charts (bar, line). */
export const dataZoomOptions: ChartOptionDef[] = [
  {
    key: "enableDataZoom",
    label: "Enable Scroll Zoom",
    type: "boolean",
    default: false,
    category: "Interaction",
    description:
      "Allow scroll-to-zoom on the data axis to explore large datasets.",
  },
];

/** Shared number formatting options for tooltip values on axis-based charts. */
export const tooltipFormatOptions: ChartOptionDef[] = [
  {
    key: "decimalPlaces",
    label: "Decimal Places",
    type: "number",
    default: -1,
    category: "Labels",
    description:
      "Fixed number of decimal places in tooltips (0-6). Set to -1 for automatic.",
  },
];

/** Shared behavior options available to all chart types except parameter-select and form. */
export const behaviorOptions: ChartOptionDef[] = [
  {
    key: "showRefreshButton",
    label: "Show Refresh Button",
    type: "boolean",
    default: false,
    category: "Behavior",
    description:
      "Display a refresh button in the widget header to manually re-fetch the query.",
  },
  {
    key: "manualRun",
    label: "Manual Run",
    type: "boolean",
    default: false,
    category: "Behavior",
    description:
      "Start with the query disabled. A 'Run Query' button must be clicked to execute. On parameter change the widget resets to the overlay.",
  },
  {
    key: "cacheMode",
    label: "Cache Mode",
    type: "select",
    default: "ttl",
    category: "Behavior",
    description:
      "TTL re-fetches data based on the cache timeout. Forever fetches once and caches until manually refreshed.",
    options: [
      { label: "TTL (time-based)", value: "ttl" },
      { label: "Forever (until refresh)", value: "forever" },
    ],
  },
];

/** Appearance options (color palette) for ECharts-based chart types. */
export const appearanceOptions: ChartOptionDef[] = [
  {
    key: "colorPalette",
    label: "Color Palette",
    type: "select",
    // Canonical id, not the `deep-ocean` alias this defaulted to until #1520.
    // `options` below is built from COLOR_PALETTES, which holds no alias, so
    // the old default matched no item and the control rendered empty on every
    // chart. The alias itself stays in PALETTE_ALIASES — dashboards saved
    // before #821 still resolve through it.
    default: "citrine",
    category: "Appearance",
    description: "Color scheme for chart series and data points.",
    options: Object.entries(COLOR_PALETTES).map(([k, v]) => ({
      value: k,
      label: v.label,
    })),
  },
];

/** Accessibility options for ECharts-based chart types. */
export const accessibilityOptions: ChartOptionDef[] = [
  {
    key: "colorblindMode",
    label: "Colorblind Mode",
    type: "boolean",
    default: false,
    category: "Accessibility",
    description:
      "Overlay distinct patterns on chart elements so data series are distinguishable without relying on color alone.",
  },
];
