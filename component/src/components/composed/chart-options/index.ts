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
};

export function getChartOptions(chartType: string): ChartOptionDef[] {
  return chartOptionsRegistry[chartType] ?? [];
}

export function getDefaultChartSettings(
  chartType: string,
): Record<string, unknown> {
  const options = getChartOptions(chartType);
  const defaults: Record<string, unknown> = {};
  for (const opt of options) {
    defaults[opt.key] = opt.default;
  }
  return defaults;
}
