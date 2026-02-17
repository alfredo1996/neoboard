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
  { key: "showValues", label: "Show Values", type: "boolean", default: false, category: "Labels" },
  { key: "showLegend", label: "Show Legend", type: "boolean", default: true, category: "Labels" },
];

const lineOptions: ChartOptionDef[] = [
  { key: "smooth", label: "Smooth Curve", type: "boolean", default: false, category: "Style" },
  { key: "area", label: "Fill Area", type: "boolean", default: false, category: "Style" },
  { key: "xAxisLabel", label: "X-Axis Label", type: "text", default: "", category: "Labels" },
  { key: "yAxisLabel", label: "Y-Axis Label", type: "text", default: "", category: "Labels" },
  { key: "showLegend", label: "Show Legend", type: "boolean", default: true, category: "Labels" },
];

const pieOptions: ChartOptionDef[] = [
  { key: "donut", label: "Donut Style", type: "boolean", default: false, category: "Style" },
  { key: "showLabel", label: "Show Labels", type: "boolean", default: true, category: "Labels" },
  { key: "showLegend", label: "Show Legend", type: "boolean", default: true, category: "Labels" },
];

const singleValueOptions: ChartOptionDef[] = [
  { key: "title", label: "Title", type: "text", default: "", category: "Display" },
  { key: "prefix", label: "Prefix", type: "text", default: "", category: "Display" },
  { key: "suffix", label: "Suffix", type: "text", default: "", category: "Display" },
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
    ],
  },
  { key: "showLabels", label: "Show Labels", type: "boolean", default: true, category: "Labels" },
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
];

const tableOptions: ChartOptionDef[] = [
  { key: "enableSorting", label: "Enable Sorting", type: "boolean", default: true, category: "Features" },
  { key: "enableSelection", label: "Row Selection", type: "boolean", default: false, category: "Features" },
  { key: "enableGlobalFilter", label: "Global Search", type: "boolean", default: true, category: "Features" },
  { key: "enableColumnFilters", label: "Column Filters", type: "boolean", default: true, category: "Features" },
  { key: "pageSize", label: "Page Size", type: "number", default: 20, category: "Pagination" },
];

const jsonOptions: ChartOptionDef[] = [
  { key: "initialExpanded", label: "Initial Expand Depth", type: "number", default: 2, category: "Display" },
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
