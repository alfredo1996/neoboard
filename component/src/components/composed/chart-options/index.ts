/**
 * The live source of chart option definitions: `ChartOptionsPanel` reads them
 * from here via `chart-options-schema`.
 *
 * MIGRATION IN PROGRESS, not deprecated. This carried an `@deprecated` tag
 * saying options had been consolidated into plugin definitions under
 * `app/src/plugins/` — they have not, and the tag read as "safe to ignore" on
 * a module the editor depends on. The consolidation is tracked by #1424;
 * until it lands, edit options here (#1549).
 */
import type { ChartOptionDef } from "./shared";
export type { ChartOptionDef } from "./shared";
import {
  behaviorOptions,
  appearanceOptions,
  accessibilityOptions,
  dataZoomOptions,
  tooltipFormatOptions,
} from "./shared";
import { barOptions } from "./bar";
import { lineOptions } from "./line";
import { pieOptions } from "./pie";
import { singleValueOptions } from "./single-value";
import { graphOptions } from "./graph";
import { mapOptions } from "./map";
import { tableOptions } from "./table";
import { jsonOptions } from "./json";
import { parameterSelectOptions } from "./parameter-select";
import { formOptions } from "./form";
import { markdownOptions } from "./markdown";
import { iframeOptions } from "./iframe";
import { gaugeOptions } from "./gauge";
import { sankeyOptions } from "./sankey";
import { sunburstOptions } from "./sunburst";
import { radarOptions } from "./radar";
import { treemapOptions } from "./treemap";
import { ganttOptions } from "./gantt";
import { circlePackingOptions } from "./circle-packing";
import { choroplethOptions } from "./choropleth";

const chartOptionsRegistry: Record<string, ChartOptionDef[]> = {
  bar: [
    ...barOptions,
    ...dataZoomOptions,
    ...tooltipFormatOptions,
    ...behaviorOptions,
    ...appearanceOptions,
    ...accessibilityOptions,
  ],
  line: [
    ...lineOptions,
    ...dataZoomOptions,
    ...tooltipFormatOptions,
    ...behaviorOptions,
    ...appearanceOptions,
    ...accessibilityOptions,
  ],
  pie: [
    ...pieOptions,
    ...tooltipFormatOptions,
    ...behaviorOptions,
    ...appearanceOptions,
    ...accessibilityOptions,
  ],
  "single-value": [...singleValueOptions, ...behaviorOptions],
  graph: [...graphOptions, ...behaviorOptions],
  map: [...mapOptions, ...behaviorOptions],
  table: [...tableOptions, ...behaviorOptions],
  json: [...jsonOptions, ...behaviorOptions],
  "parameter-select": parameterSelectOptions,
  form: formOptions,
  markdown: markdownOptions,
  iframe: iframeOptions,
  gauge: [...gaugeOptions, ...behaviorOptions, ...appearanceOptions],
  sankey: [...sankeyOptions, ...behaviorOptions, ...appearanceOptions],
  sunburst: [...sunburstOptions, ...behaviorOptions, ...appearanceOptions],
  radar: [...radarOptions, ...behaviorOptions, ...appearanceOptions],
  treemap: [...treemapOptions, ...behaviorOptions, ...appearanceOptions],
  gantt: [...ganttOptions, ...behaviorOptions, ...appearanceOptions],
  "circle-packing": [
    ...circlePackingOptions,
    ...behaviorOptions,
    ...appearanceOptions,
  ],
  choropleth: [...choroplethOptions, ...behaviorOptions, ...appearanceOptions],
};

/**
 * Every chart type that declares options. Exported so a test can sweep all of
 * them rather than restating the list and silently missing a new one.
 */
export const CHART_TYPES_WITH_OPTIONS = Object.keys(chartOptionsRegistry);

export function getChartOptions(chartType: string): ChartOptionDef[] {
  return chartOptionsRegistry[chartType] ?? [];
}

export function getDefaultChartSettings(
  chartType: string,
): Record<string, unknown> {
  const options = getChartOptions(chartType);
  const defaults: Record<string, unknown> = {};
  for (const opt of options) {
    // An option with no default is left out entirely rather than written as
    // `undefined`, so the chart's own resolution rule governs (#1592).
    if (opt.default !== undefined) defaults[opt.key] = opt.default;
  }
  return defaults;
}
