import { COLOR_PALETTES } from "@/charts/palettes";

/**
 * Every group an editor row can sit in, in the order the editor shows them
 * (#2388, from #1424): the order is fixed for every chart type, so a group
 * keeps its place from one chart to the next. Each group belongs to one
 * section. Named after the part of the chart, not after a concern.
 */
export const OPTION_GROUPS = {
  // Content widgets (markdown, iframe): the first and only data section
  Content: "content",
  // Data
  Template: "data",
  Filter: "data",
  Query: "data",
  Fields: "data",
  Transform: "data",
  // Style
  // Drawn by the editor, not by a chart: every widget has it (#2394)
  Card: "style",
  Text: "style",
  Field: "style",
  "Submit button": "style",
  Bars: "style",
  Lines: "style",
  Slices: "style",
  Gauge: "style",
  Value: "style",
  Layout: "style",
  Map: "style",
  Markers: "style",
  Columns: "style",
  Rows: "style",
  Grouping: "style",
  Numbers: "style",
  Axes: "style",
  Legend: "style",
  "Data labels": "style",
  Color: "style",
  "Reference lines": "style",
  Rules: "style",
  // Behavior
  Input: "behavior",
  Refresh: "behavior",
  Caching: "behavior",
  Interaction: "behavior",
  Performance: "behavior",
  Security: "behavior",
  "After submit": "behavior",
  "Write mode": "behavior",
} as const;

export type OptionGroup = keyof typeof OPTION_GROUPS;
export type OptionSection = (typeof OPTION_GROUPS)[OptionGroup];

export interface ChartOptionDef {
  key: string;
  label: string;
  type:
    | "boolean"
    | "select"
    | "text"
    | "textarea"
    | "number"
    | "swatch"
    | "column-multi-select";
  default: unknown;
  category: OptionGroup;
  /**
   * For type: "select" and "swatch". A swatch option names the CSS custom
   * property (without var()) whose colour its chip shows (#2368).
   */
  options?: { label: string; value: string; token?: string }[];
  /**
   * Short help text rendered under the option label. Visible text, not a
   * tooltip — the control points at it with aria-describedby (#1283 item 2b).
   * Kept to 90 characters; a ratchet test enforces it (#1549).
   */
  description?: string;
  /** Only for type: "text": the field stops taking characters here. */
  maxLength?: number;
  /** Only for type: "number": shown while the field is empty. */
  placeholder?: string;
  /** Unit written after a number field (px, %, min). */
  unit?: string;
  /**
   * Only for type: "number". The stored value that means automatic (`0` or
   * `-1` on disk): the field shows it empty, reading "Auto", and writes it back
   * when emptied (#2388). Stored values do not change.
   */
  auto?: number;
  /** Stored as text with a % suffix ("30%"), edited as a number. */
  percent?: boolean;
  /** Rows of text: a JSON option gets a small textarea instead of one line. */
  multiline?: boolean;
  /**
   * One line shown under the control, only where it adds a rule. Everything
   * else stays in `description`, which a screen reader reads (#2388).
   */
  help?: string;
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
  // No default on purpose: `resolveShowLegend` shows a legend once there is
  // more than one series, and a stored `true` made that rule unreachable — so
  // every single-series chart carried a one-swatch legend (#1592).
  default: undefined,
  category: "Legend",
  help: "Automatic with two or more series. Turn on to show it for one.",
  description:
    "Shown automatically for two or more series. Tick to force it on for a single series.",
};

export const SHARED_X_AXIS_LABEL: ChartOptionDef = {
  key: "xAxisLabel",
  label: "X Axis Label",
  type: "text",
  default: "",
  category: "Axes",
  description: "Custom label displayed below the horizontal axis.",
};

export const SHARED_Y_AXIS_LABEL: ChartOptionDef = {
  key: "yAxisLabel",
  label: "Y Axis Label",
  type: "text",
  default: "",
  category: "Axes",
  description: "Custom label displayed beside the vertical axis.",
};

export const SHARED_SHOW_GRID_LINES: ChartOptionDef = {
  key: "showGridLines",
  label: "Grid Lines",
  type: "boolean",
  default: true,
  category: "Axes",
  description: "Show faint horizontal reference lines behind the chart.",
};

export const SHARED_REFERENCE_LINES: ChartOptionDef = {
  key: "referenceLines",
  label: "Lines",
  type: "text",
  default: "",
  category: "Reference lines",
  multiline: true,
  help: 'JSON: [{"value":50,"label":"Target","color":"#ff0000"}]',
  description:
    'Value-axis reference lines as JSON: [{"value":50,"label":"Target","color":"#ff0000"}]',
};

export const SHARED_SHOW_LABELS: ChartOptionDef = {
  key: "showLabels",
  label: "Show Labels",
  type: "boolean",
  default: true,
  category: "Data labels",
  description: "Show the name label on each element.",
};

/** DataZoom option for axis-based charts (bar, line). */
export const dataZoomOptions: ChartOptionDef[] = [
  {
    key: "enableDataZoom",
    label: "Scroll Zoom",
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
    category: "Data labels",
    auto: -1,
    help: "0 to 6.",
    description:
      "Fixed number of decimal places in tooltips (0-6). Leave empty for automatic.",
  },
];

/** Shared behavior options (the editor draws Caching itself, #2388) available to all chart types except parameter-select and form. */
export const behaviorOptions: ChartOptionDef[] = [
  {
    key: "showRefreshButton",
    label: "Refresh Button",
    type: "boolean",
    default: false,
    category: "Refresh",
    description:
      "Display a refresh button in the widget header to manually re-fetch the query.",
  },
  {
    key: "manualRun",
    label: "Manual Run",
    type: "boolean",
    default: false,
    category: "Refresh",
    help: "Starts behind a Run Query button. Parameter changes reset it.",
    description:
      "Start disabled behind a 'Run Query' button. Parameter changes reset the overlay.",
  },
  // The editor draws Caching itself, as one choice with the cache switch and
  // the timeout (#2388); this stays so a new widget still stores "ttl".
  {
    key: "cacheMode",
    label: "Cache Mode",
    type: "select",
    default: "ttl",
    category: "Caching",
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
    label: "Palette",
    type: "select",
    // Must be a COLOR_PALETTES key: `options` below is built from it, and a
    // default that matches no item leaves the control empty on every chart
    // (#1520, when this still said `deep-ocean`).
    default: "hastings",
    category: "Color",
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
    category: "Color",
    help: "Adds patterns, so series differ without color.",
    description:
      "Overlay distinct patterns so series are distinguishable without relying on color.",
  },
];
