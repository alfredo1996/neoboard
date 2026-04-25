/**
 * Canonical list of chart types.
 *
 * The `ChartType` union is derived from this array so there is exactly
 * one place to update when adding a new chart type. The plugin
 * registration loop in `plugins/index.ts` validates that every entry
 * in this array has a matching registered plugin at startup.
 */
export const CHART_TYPES = [
  "bar",
  "line",
  "pie",
  "table",
  "single-value",
  "graph",
  "map",
  "json",
  "parameter-select",
  "form",
  "markdown",
  "iframe",
  "gauge",
  "sankey",
  "sunburst",
  "radar",
  "treemap",
  "gantt",
  "circle-packing",
  "choropleth",
] as const;

export type ChartType = (typeof CHART_TYPES)[number];
