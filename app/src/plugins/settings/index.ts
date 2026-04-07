/**
 * Re-exports all chart plugin settings schemas and their inferred types.
 */
export { barSettingsSchema, type BarSettings } from "./bar";
export { lineSettingsSchema, type LineSettings } from "./line";
export { pieSettingsSchema, type PieSettings } from "./pie";
export { gaugeSettingsSchema, type GaugeSettings } from "./gauge";
export { radarSettingsSchema, type RadarSettings } from "./radar";
export { sankeySettingsSchema, type SankeySettings } from "./sankey";
export { sunburstSettingsSchema, type SunburstSettings } from "./sunburst";
export { treemapSettingsSchema, type TreemapSettings } from "./treemap";
export {
  singleValueSettingsSchema,
  type SingleValueSettings,
} from "./single-value";
export { tableSettingsSchema, type TableSettings } from "./table";
export { jsonSettingsSchema, type JsonSettings } from "./json";
export { graphSettingsSchema, type GraphSettings } from "./graph";
export { mapSettingsSchema, type MapSettings } from "./map";
export { markdownSettingsSchema, type MarkdownSettings } from "./markdown";
export { iframeSettingsSchema, type IframeSettings } from "./iframe";
export { formSettingsSchema, type FormSettings } from "./form";
export {
  parameterSelectSettingsSchema,
  type ParameterSelectSettings,
} from "./parameter-select";
