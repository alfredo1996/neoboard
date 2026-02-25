export interface ChartOptionDef {
  key: string;
  label: string;
  type: "boolean" | "select" | "text" | "number";
  default: unknown;
  category: string;
  /** Only for type: "select" */
  options?: { label: string; value: string }[];
}

const barOptions: ChartOptionDef[] = [
  {
    key: "orientation",
    label: "Orientation",
    type: "select",
    default: "vertical",
    category: "Layout",
    options: [
      { label: "Vertical", value: "vertical" },
      { label: "Horizontal", value: "horizontal" },
    ],
  },
  { key: "stacked", label: "Stacked", type: "boolean", default: false, category: "Layout" },
  { key: "barWidth", label: "Bar Width (px, 0=auto)", type: "number", default: 0, category: "Layout" },
  { key: "barGap", label: "Bar Gap", type: "text", default: "30%", category: "Layout" },
  { key: "showValues", label: "Show Values", type: "boolean", default: false, category: "Labels" },
  { key: "showLegend", label: "Show Legend", type: "boolean", default: true, category: "Labels" },
  { key: "xAxisLabel", label: "X-Axis Label", type: "text", default: "", category: "Labels" },
  { key: "yAxisLabel", label: "Y-Axis Label", type: "text", default: "", category: "Labels" },
  { key: "showGridLines", label: "Show Grid Lines", type: "boolean", default: true, category: "Style" },
];

const lineOptions: ChartOptionDef[] = [
  { key: "smooth", label: "Smooth Curve", type: "boolean", default: false, category: "Style" },
  { key: "area", label: "Fill Area", type: "boolean", default: false, category: "Style" },
  { key: "lineWidth", label: "Line Width (px)", type: "number", default: 2, category: "Style" },
  { key: "stepped", label: "Stepped Line", type: "boolean", default: false, category: "Style" },
  { key: "showPoints", label: "Show Data Points", type: "boolean", default: false, category: "Style" },
  { key: "showGridLines", label: "Show Grid Lines", type: "boolean", default: true, category: "Style" },
  { key: "xAxisLabel", label: "X-Axis Label", type: "text", default: "", category: "Labels" },
  { key: "yAxisLabel", label: "Y-Axis Label", type: "text", default: "", category: "Labels" },
  { key: "showLegend", label: "Show Legend", type: "boolean", default: true, category: "Labels" },
];

const pieOptions: ChartOptionDef[] = [
  { key: "donut", label: "Donut Style", type: "boolean", default: false, category: "Style" },
  { key: "roseMode", label: "Rose/Nightingale Mode", type: "boolean", default: false, category: "Style" },
  {
    key: "labelPosition",
    label: "Label Position",
    type: "select",
    default: "outside",
    category: "Labels",
    options: [
      { label: "Outside", value: "outside" },
      { label: "Inside", value: "inside" },
      { label: "Center", value: "center" },
    ],
  },
  { key: "showLabel", label: "Show Labels", type: "boolean", default: true, category: "Labels" },
  { key: "showPercentage", label: "Show Percentage", type: "boolean", default: true, category: "Labels" },
  { key: "showLegend", label: "Show Legend", type: "boolean", default: true, category: "Labels" },
  { key: "sortSlices", label: "Sort Slices by Value", type: "boolean", default: false, category: "Layout" },
];

const singleValueOptions: ChartOptionDef[] = [
  { key: "title", label: "Title", type: "text", default: "", category: "Display" },
  { key: "prefix", label: "Prefix", type: "text", default: "", category: "Display" },
  { key: "suffix", label: "Suffix", type: "text", default: "", category: "Display" },
  {
    key: "fontSize",
    label: "Font Size",
    type: "select",
    default: "lg",
    category: "Display",
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
    options: [
      { label: "Plain", value: "plain" },
      { label: "Comma", value: "comma" },
      { label: "Compact", value: "compact" },
      { label: "Percent", value: "percent" },
    ],
  },
  { key: "trendEnabled", label: "Show Trend Indicator", type: "boolean", default: false, category: "Display" },
  {
    key: "colorThresholds",
    label: "Color Thresholds (JSON)",
    type: "text",
    default: "",
    category: "Display",
  },
];

const graphOptions: ChartOptionDef[] = [
  {
    key: "layout",
    label: "Layout",
    type: "select",
    default: "force",
    category: "Layout",
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
    options: [
      { label: "Small", value: "small" },
      { label: "Medium", value: "medium" },
      { label: "Large", value: "large" },
    ],
  },
  { key: "showLabels", label: "Show Labels", type: "boolean", default: true, category: "Labels" },
  { key: "showRelationshipLabels", label: "Show Relationship Labels", type: "boolean", default: true, category: "Labels" },
  { key: "physics", label: "Enable Physics", type: "boolean", default: true, category: "Style" },
];

const mapOptions: ChartOptionDef[] = [
  {
    key: "tileLayer",
    label: "Tile Layer",
    type: "select",
    default: "osm",
    category: "Map",
    options: [
      { label: "OpenStreetMap", value: "osm" },
      { label: "Carto Light", value: "carto-light" },
      { label: "Carto Dark", value: "carto-dark" },
    ],
  },
  { key: "zoom", label: "Default Zoom", type: "number", default: 3, category: "Map" },
  { key: "minZoom", label: "Min Zoom", type: "number", default: 2, category: "Map" },
  { key: "maxZoom", label: "Max Zoom", type: "number", default: 18, category: "Map" },
  { key: "autoFitBounds", label: "Auto-fit Bounds", type: "boolean", default: true, category: "Map" },
  { key: "markerSize", label: "Marker Size (px)", type: "number", default: 6, category: "Markers" },
  { key: "clusterMarkers", label: "Cluster Markers", type: "boolean", default: false, category: "Markers" },
  { key: "showPopup", label: "Show Popup on Click", type: "boolean", default: true, category: "Markers" },
];

const tableOptions: ChartOptionDef[] = [
  { key: "enableSorting", label: "Enable Sorting", type: "boolean", default: true, category: "Features" },
  { key: "enableSelection", label: "Row Selection", type: "boolean", default: false, category: "Features" },
  { key: "enableGlobalFilter", label: "Global Search", type: "boolean", default: true, category: "Features" },
  { key: "enableColumnFilters", label: "Column Filters", type: "boolean", default: true, category: "Features" },
  { key: "enablePagination", label: "Enable Pagination", type: "boolean", default: true, category: "Pagination" },
  { key: "pageSize", label: "Page Size", type: "number", default: 20, category: "Pagination" },
];

const jsonOptions: ChartOptionDef[] = [
  { key: "initialExpanded", label: "Initial Expand Depth", type: "number", default: 2, category: "Display" },
  {
    key: "fontSize",
    label: "Font Size",
    type: "select",
    default: "sm",
    category: "Display",
    options: [
      { label: "Small", value: "sm" },
      { label: "Medium", value: "md" },
      { label: "Large", value: "lg" },
    ],
  },
  { key: "showCopyButton", label: "Show Copy Button", type: "boolean", default: true, category: "Display" },
  {
    key: "theme",
    label: "Theme",
    type: "select",
    default: "dark",
    category: "Display",
    options: [
      { label: "Dark", value: "dark" },
      { label: "Light", value: "light" },
    ],
  },
];

const parameterSelectOptions: ChartOptionDef[] = [
  { key: "parameterName", label: "Parameter Name", type: "text", default: "", category: "Parameter" },
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
