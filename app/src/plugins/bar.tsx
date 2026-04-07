/**
 * Bar chart plugin.
 *
 * Horizontal / vertical / stacked bars for comparing categories.
 * Supports click actions, rule-based styling, and axis data zoom.
 */

import dynamic from "next/dynamic";
import { Skeleton } from "@neoboard/components";
import type { BarChartDataPoint, StylingRule } from "@neoboard/components";
import { defineChartPlugin } from "./registry";
import { transformToBarData, validateBarData } from "./transforms/bar";
import { useEChartsClick, type PluginProps } from "./utils";
import { barSettingsSchema } from "./settings/bar";

const BarChart = dynamic(
  () => import("@neoboard/components").then((m) => ({ default: m.BarChart })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> },
);

function BarPluginComponent({
  data,
  settings: raw,
  onChartClick,
  colorThresholds,
  stylingRules,
  paramValues,
}: PluginProps) {
  const onClick = useEChartsClick(onChartClick, data);
  const settings = barSettingsSchema.parse(raw);

  return (
    <BarChart
      data={(data as BarChartDataPoint[]) ?? []}
      orientation={settings.orientation}
      stacked={settings.stacked}
      showValues={settings.showValues}
      showLegend={settings.showLegend}
      barWidth={settings.barWidth}
      barGap={settings.barGap}
      xAxisLabel={settings.xAxisLabel}
      yAxisLabel={settings.yAxisLabel}
      showGridLines={settings.showGridLines}
      axisLabelRotation={settings.axisLabelRotation}
      referenceLines={settings.referenceLines}
      colorThresholds={colorThresholds}
      stylingRules={stylingRules as StylingRule[] | undefined}
      paramValues={paramValues}
      onClick={onClick}
      enableDataZoom={settings.enableDataZoom}
      colorPalette={settings.colorPalette}
      colorblindMode={settings.colorblindMode}
    />
  );
}

export const barPlugin = defineChartPlugin({
  type: "bar",
  label: "Bar Chart",
  component: BarPluginComponent,
  transform: transformToBarData,
  transformWithMapping: transformToBarData,
  validate: validateBarData,
  compatibleWith: ["neo4j", "postgresql"],
  settingsSchema: barSettingsSchema,
  stylingTargets: [{ value: "color", label: "Bar Color" }],
  capabilities: {
    supportsClickAction: true,
    supportsStyling: true,
    isECharts: true,
    requiresQuery: true,
  },
  queryHint:
    "Return 2+ columns: first = category label (string), rest = numeric series.\n" +
    "Example: RETURN genre, count(*) AS films",
});
