export interface ChartOptionDef {
  key: string;
  label: string;
  type: "boolean" | "select" | "text" | "number";
  default: unknown;
  category: string;
  /** Only for type: "select" */
  options?: { label: string; value: string }[];
  /** Short description shown in a tooltip next to the option label. */
  description?: string;
}

const barOptions: ChartOptionDef[] = [
  {
    key: "orientation",
    label: "Orientation",
    type: "select",
    default: "vertical",
    category: "Layout",
    description: "Vertical bars grow upward; horizontal bars grow left-to-right.",
    options: [
      { label: "Vertical", value: "vertical" },
      { label: "Horizontal", value: "horizontal" },
    ],
  },
  { key: "stacked", label: "Stacked", type: "boolean", default: false, category: "Layout", description: "Stack series on top of each other instead of placing them side by side." },
  { key: "barWidth", label: "Bar Width (px, 0=auto)", type: "number", default: 0, category: "Layout", description: "Width of each bar in pixels. Set to 0 to let the chart auto-size." },
  { key: "barGap", label: "Bar Gap", type: "text", default: "30%", category: "Layout", description: "Gap between bar groups as a percentage of the bar width (e.g. '30%')." },
  { key: "showValues", label: "Show Values", type: "boolean", default: false, category: "Labels", description: "Display the numeric value as a label on each bar." },
  { key: "showLegend", label: "Show Legend", type: "boolean", default: true, category: "Labels", description: "Show the chart legend identifying each data series." },
  { key: "xAxisLabel", label: "X-Axis Label", type: "text", default: "", category: "Labels", description: "Custom label displayed below the horizontal axis." },
  { key: "yAxisLabel", label: "Y-Axis Label", type: "text", default: "", category: "Labels", description: "Custom label displayed beside the vertical axis." },
  { key: "showGridLines", label: "Show Grid Lines", type: "boolean", default: true, category: "Style", description: "Show faint horizontal reference lines behind the bars." },
];

const lineOptions: ChartOptionDef[] = [
  { key: "smooth", label: "Smooth Curve", type: "boolean", default: false, category: "Style", description: "Render lines as smooth Bézier curves instead of straight segments." },
  { key: "area", label: "Fill Area", type: "boolean", default: false, category: "Style", description: "Fill the area beneath the line to emphasise volume over time." },
  { key: "lineWidth", label: "Line Width (px)", type: "number", default: 2, category: "Style", description: "Stroke width of the line in pixels." },
  { key: "stepped", label: "Stepped Line", type: "boolean", default: false, category: "Style", description: "Draw the line as a step function — useful for discrete state changes." },
  { key: "showPoints", label: "Show Data Points", type: "boolean", default: false, category: "Style", description: "Draw a dot at each data point along the line." },
  { key: "showGridLines", label: "Show Grid Lines", type: "boolean", default: true, category: "Style", description: "Show faint horizontal reference lines behind the line." },
  { key: "xAxisLabel", label: "X-Axis Label", type: "text", default: "", category: "Labels", description: "Custom label displayed below the horizontal axis." },
  { key: "yAxisLabel", label: "Y-Axis Label", type: "text", default: "", category: "Labels", description: "Custom label displayed beside the vertical axis." },
  { key: "showLegend", label: "Show Legend", type: "boolean", default: true, category: "Labels", description: "Show the chart legend identifying each data series." },
];

const pieOptions: ChartOptionDef[] = [
  { key: "donut", label: "Donut Style", type: "boolean", default: false, category: "Style", description: "Cut a circular hole in the centre to render the chart as a donut." },
  { key: "roseMode", label: "Rose/Nightingale Mode", type: "boolean", default: false, category: "Style", description: "Vary each slice's radius by its value (Nightingale / rose chart)." },
  {
    key: "labelPosition",
    label: "Label Position",
    type: "select",
    default: "outside",
    category: "Labels",
    description: "Where to place the slice labels relative to the chart.",
    options: [
      { label: "Outside", value: "outside" },
      { label: "Inside", value: "inside" },
      { label: "Center", value: "center" },
    ],
  },
  { key: "showLabel", label: "Show Labels", type: "boolean", default: true, category: "Labels", description: "Show the category name on each slice." },
  { key: "showPercentage", label: "Show Percentage", type: "boolean", default: true, category: "Labels", description: "Show the percentage value on each slice." },
  { key: "showLegend", label: "Show Legend", type: "boolean", default: true, category: "Labels", description: "Show the chart legend identifying each slice." },
  { key: "sortSlices", label: "Sort Slices by Value", type: "boolean", default: false, category: "Layout", description: "Sort slices by value (largest first) for a cleaner visual layout." },
];

const singleValueOptions: ChartOptionDef[] = [
  { key: "title", label: "Title", type: "text", default: "", category: "Display", description: "Custom heading shown above the value. Leave blank to hide." },
  { key: "prefix", label: "Prefix", type: "text", default: "", category: "Display", description: "Text prepended to the value (e.g. '$', '€')." },
  { key: "suffix", label: "Suffix", type: "text", default: "", category: "Display", description: "Text appended to the value (e.g. '%', ' items')." },
  {
    key: "fontSize",
    label: "Font Size",
    type: "select",
    default: "lg",
    category: "Display",
    description: "Size of the main displayed value.",
    options: [
      { label: "Small", value: "sm" },
      { label: "Medium", value: "md" },
      { label: "Large", value: "lg" },
      { label: "Extra Large", value: "xl" },
    ],
  },
  {
    key: "numberFormat",
    label: "Number Format",
    type: "select",
    default: "plain",
    category: "Display",
    description: "How to format the numeric value — plain, comma-separated, compact (1.2k), or percentage.",
    options: [
      { label: "Plain", value: "plain" },
      { label: "Comma", value: "comma" },
      { label: "Compact", value: "compact" },
      { label: "Percent", value: "percent" },
    ],
  },
  { key: "trendEnabled", label: "Show Trend Indicator", type: "boolean", default: false, category: "Display", description: "Show a trend arrow comparing the current value to the previous period (requires 2 rows in the query result)." },
  { key: "colorThresholds", label: "Color Thresholds (JSON)", type: "text", default: "", category: "Display", description: "Define colour bands for the value as JSON, e.g. [{\"max\":100,\"color\":\"green\"},{\"color\":\"red\"}]." },
];

const graphOptions: ChartOptionDef[] = [
  {
    key: "layout",
    label: "Layout",
    type: "select",
    default: "force",
    category: "Layout",
    description: "Algorithm used to position nodes: force simulation, circular ring, or hierarchical tree.",
    options: [
      { label: "Force", value: "force" },
      { label: "Circular", value: "circular" },
      { label: "Hierarchical", value: "hierarchical" },
    ],
  },
  {
    key: "nodeSize",
    label: "Node Size",
    type: "select",
    default: "medium",
    category: "Layout",
    description: "Visual size of each node circle.",
    options: [
      { label: "Small", value: "small" },
      { label: "Medium", value: "medium" },
      { label: "Large", value: "large" },
    ],
  },
  { key: "showLabels", label: "Show Labels", type: "boolean", default: true, category: "Labels", description: "Show the node label (first string property) on each node." },
  { key: "showRelationshipLabels", label: "Show Relationship Labels", type: "boolean", default: true, category: "Labels", description: "Show the relationship type name on each edge." },
  { key: "physics", label: "Enable Physics", type: "boolean", default: true, category: "Style", description: "Enable physics simulation so nodes repel and edges act as springs." },
];

const mapOptions: ChartOptionDef[] = [
  {
    key: "tileLayer",
    label: "Tile Layer",
    type: "select",
    default: "osm",
    category: "Map",
    description: "Base-map tile provider. OpenStreetMap is open and free; Carto variants are cleaner for data overlays.",
    options: [
      { label: "OpenStreetMap", value: "osm" },
      { label: "Carto Light", value: "carto-light" },
      { label: "Carto Dark", value: "carto-dark" },
    ],
  },
  { key: "zoom", label: "Default Zoom", type: "number", default: 3, category: "Map", description: "Initial zoom level when the map first renders (1 = world view, 18 = street level)." },
  { key: "minZoom", label: "Min Zoom", type: "number", default: 2, category: "Map", description: "Minimum zoom level the user can zoom out to." },
  { key: "maxZoom", label: "Max Zoom", type: "number", default: 18, category: "Map", description: "Maximum zoom level the user can zoom in to." },
  { key: "autoFitBounds", label: "Auto-fit Bounds", type: "boolean", default: true, category: "Map", description: "Automatically pan and zoom to fit all markers on the initial load." },
  { key: "markerSize", label: "Marker Size (px)", type: "number", default: 6, category: "Markers", description: "Radius of each map marker circle in pixels." },
  { key: "clusterMarkers", label: "Cluster Markers", type: "boolean", default: false, category: "Markers", description: "Group nearby markers into a single cluster badge at lower zoom levels." },
  { key: "showPopup", label: "Show Popup on Click", type: "boolean", default: true, category: "Markers", description: "Show a popup with the row data when the user clicks a marker." },
];

const tableOptions: ChartOptionDef[] = [
  { key: "enableSorting", label: "Enable Sorting", type: "boolean", default: true, category: "Features", description: "Allow clicking column headers to sort rows ascending or descending." },
  { key: "enableSelection", label: "Row Selection", type: "boolean", default: false, category: "Features", description: "Allow selecting individual rows by clicking them." },
  { key: "enableGlobalFilter", label: "Global Search", type: "boolean", default: true, category: "Features", description: "Show a search box that filters all rows across all columns." },
  { key: "enableColumnFilters", label: "Column Filters", type: "boolean", default: true, category: "Features", description: "Show per-column filter inputs below each column header." },
  { key: "enablePagination", label: "Enable Pagination", type: "boolean", default: true, category: "Pagination", description: "Show Previous / Next controls to page through large result sets." },
  { key: "pageSize", label: "Page Size", type: "number", default: 10, category: "Pagination", description: "Number of rows shown per page when pagination is enabled." },
  { key: "emptyMessage", label: "Empty Message", type: "text", default: "No results", category: "Display", description: "Text displayed when the query returns no rows." },
];

const jsonOptions: ChartOptionDef[] = [
  { key: "initialExpanded", label: "Initial Expand Depth", type: "number", default: 2, category: "Display", description: "How many levels deep the JSON tree is expanded when first rendered (0 = collapsed)." },
  {
    key: "fontSize",
    label: "Font Size",
    type: "select",
    default: "sm",
    category: "Display",
    description: "Font size used for the JSON syntax highlighting.",
    options: [
      { label: "Small", value: "sm" },
      { label: "Medium", value: "md" },
      { label: "Large", value: "lg" },
    ],
  },
  { key: "showCopyButton", label: "Show Copy Button", type: "boolean", default: true, category: "Display", description: "Show a button to copy the full JSON payload to the clipboard." },
  {
    key: "theme",
    label: "Theme",
    type: "select",
    default: "dark",
    category: "Display",
    description: "Colour theme for the JSON syntax highlighting.",
    options: [
      { label: "Dark", value: "dark" },
      { label: "Light", value: "light" },
    ],
  },
];

const parameterSelectOptions: ChartOptionDef[] = [
  { key: "placeholder", label: "Placeholder", type: "text", default: "", category: "Parameter", description: "Hint text shown inside the selector when no value has been chosen." },
  { key: "searchable", label: "Search-as-you-type", type: "boolean", default: false, category: "Parameter", description: "Allow the user to type to filter the option list in real time." },
];

const chartOptionsRegistry: Record<string, ChartOptionDef[]> = {
  bar: barOptions,
  line: lineOptions,
  pie: pieOptions,
  "single-value": singleValueOptions,
  graph: graphOptions,
  map: mapOptions,
  table: tableOptions,
  json: jsonOptions,
  "parameter-select": parameterSelectOptions,
};

export function getChartOptions(chartType: string): ChartOptionDef[] {
  return chartOptionsRegistry[chartType] ?? [];
}

export function getDefaultChartSettings(chartType: string): Record<string, unknown> {
  const options = getChartOptions(chartType);
  const defaults: Record<string, unknown> = {};
  for (const opt of options) {
    defaults[opt.key] = opt.default;
  }
  return defaults;
}
