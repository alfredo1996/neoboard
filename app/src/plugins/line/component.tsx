/**
 * Line chart plugin.
 *
 * Line/area/stepped time-series charts with optional dual Y-axis support.
 * Supports click actions, rule-based styling, and axis data zoom.
 */

import dynamic from "next/dynamic";
import { Skeleton, getChartOptions } from "@neoboard/components";
import type { LineChartDataPoint, StylingRule } from "@neoboard/components";
import { defineChartPlugin } from "../registry";
import { transformToLineData, validateLineData } from "./transform";
import { useEChartsClick, type PluginProps } from "../utils";
import { lineSettingsSchema } from "./settings";
import { safeParseSettings } from "@/lib/plugin/safe-parse-settings";

const LineChart = dynamic(
  () => import("@neoboard/components").then((m) => ({ default: m.LineChart })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> },
);

function LinePluginComponent({
  data,
  settings: raw,
  stylingRules,
  paramValues,
  onChartClick,
}: PluginProps) {
  const onClick = useEChartsClick(onChartClick, data);
  const settings = safeParseSettings(lineSettingsSchema, raw, "line");
  // Parse comma-separated rightAxisSeries string into string array
  const rightAxisSeries = settings.rightAxisSeries
    ? settings.rightAxisSeries
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : undefined;

  return (
    <LineChart
      data={(data as LineChartDataPoint[]) ?? []}
      smooth={settings.smooth}
      area={settings.area}
      xAxisLabel={settings.xAxisLabel}
      yAxisLabel={settings.yAxisLabel}
      rightYAxisLabel={settings.rightYAxisLabel}
      rightAxisSeries={rightAxisSeries}
      showLegend={settings.showLegend}
      samplingThreshold={settings.samplingThreshold}
      samplingMethod={settings.samplingMethod}
      decimalPlaces={settings.decimalPlaces}
      legendPosition={settings.legendPosition}
      lineWidth={settings.lineWidth}
      stepped={settings.stepped}
      showPoints={settings.showPoints}
      showGridLines={settings.showGridLines}
      connectNulls={settings.connectNulls}
      endLabel={settings.endLabel}
      referenceLines={settings.referenceLines}
      stylingRules={stylingRules as StylingRule[] | undefined}
      paramValues={paramValues}
      onClick={onClick}
      enableDataZoom={settings.enableDataZoom}
      colorPalette={settings.colorPalette}
      colorblindMode={settings.colorblindMode}
    />
  );
}

export const linePlugin = defineChartPlugin({
  type: "line",
  label: "Line Chart",
  component: LinePluginComponent,
  transform: transformToLineData,
  transformWithMapping: transformToLineData,
  validate: validateLineData,
  options: getChartOptions("line"),
  compatibleWith: ["neo4j", "postgresql"],
  settingsSchema: lineSettingsSchema,
  stylingTargets: [{ value: "color", label: "Line Color" }],
  capabilities: {
    supportsClickAction: true,
    supportsStyling: true,
    isECharts: true,
    requiresQuery: true,
  },
  queryHint:
    "Return 2+ columns: first = x-axis label, rest = numeric series.\n" +
    "Example: RETURN month, revenue, expenses",
});
