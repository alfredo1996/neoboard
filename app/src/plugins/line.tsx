/**
 * Line chart plugin.
 *
 * Line/area/stepped time-series charts with optional dual Y-axis support.
 * Supports click actions, rule-based styling, and axis data zoom.
 */

import dynamic from "next/dynamic";
import { Skeleton } from "@neoboard/components";
import type { LineChartDataPoint, StylingRule } from "@neoboard/components";
import { defineChartPlugin } from "./registry";
import { transformToLineData, validateLineData } from "./transforms/line";
import { useEChartsClick, type PluginProps } from "./utils";

const LineChart = dynamic(
  () => import("@neoboard/components").then((m) => ({ default: m.LineChart })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> },
);

function LinePluginComponent({
  data,
  settings,
  stylingRules,
  paramValues,
  onChartClick,
  colorThresholds,
}: PluginProps) {
  const onClick = useEChartsClick(onChartClick, data);
  // Parse comma-separated rightAxisSeries string into string array
  const rightAxisSeriesRaw = settings.rightAxisSeries as string | undefined;
  const rightAxisSeries = rightAxisSeriesRaw
    ? rightAxisSeriesRaw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : undefined;

  return (
    <LineChart
      data={(data as LineChartDataPoint[]) ?? []}
      smooth={settings.smooth as boolean | undefined}
      area={settings.area as boolean | undefined}
      xAxisLabel={settings.xAxisLabel as string | undefined}
      yAxisLabel={settings.yAxisLabel as string | undefined}
      rightYAxisLabel={settings.rightYAxisLabel as string | undefined}
      rightAxisSeries={rightAxisSeries}
      showLegend={settings.showLegend as boolean | undefined}
      lineWidth={settings.lineWidth as number | undefined}
      stepped={settings.stepped as boolean | undefined}
      showPoints={settings.showPoints as boolean | undefined}
      showGridLines={settings.showGridLines as boolean | undefined}
      connectNulls={settings.connectNulls as boolean | undefined}
      endLabel={settings.endLabel as boolean | undefined}
      referenceLines={settings.referenceLines as string | undefined}
      colorThresholds={colorThresholds}
      stylingRules={stylingRules as StylingRule[] | undefined}
      paramValues={paramValues}
      onClick={onClick}
      enableDataZoom={settings.enableDataZoom as boolean | undefined}
      colorPalette={settings.colorPalette as string | undefined}
      colorblindMode={settings.colorblindMode as boolean | undefined}
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
  compatibleWith: ["neo4j", "postgresql"],
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
