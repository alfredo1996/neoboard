/**
 * Gauge chart plugin.
 *
 * Radial gauge displaying a single value against a configurable range.
 * Supports click actions and rule-based styling.
 */

import dynamic from "next/dynamic";
import { Skeleton, getChartOptions } from "@neoboard/components";
import type { GaugeDataPoint, StylingRule } from "@neoboard/components";
import { defineChartPlugin } from "../registry";
import { transformToGaugeData } from "./transform";
import { useEChartsClick, type PluginProps } from "../utils";
import { gaugeSettingsSchema } from "./settings";

const GaugeChart = dynamic(
  () => import("@neoboard/components").then((m) => ({ default: m.GaugeChart })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> },
);

function GaugePluginComponent({
  data,
  settings: raw,
  stylingRules,
  paramValues,
  onChartClick,
}: PluginProps) {
  const onClick = useEChartsClick(onChartClick, data);
  const settings = gaugeSettingsSchema.parse(raw);
  return (
    <GaugeChart
      data={(data as GaugeDataPoint[]) ?? []}
      min={settings.min}
      max={settings.max}
      showProgress={settings.showProgress}
      showDetail={settings.showDetail}
      startAngle={settings.startAngle}
      endAngle={settings.endAngle}
      colorPalette={settings.colorPalette}
      stylingRules={stylingRules as StylingRule[] | undefined}
      paramValues={paramValues}
      colorblindMode={settings.colorblindMode}
      onClick={onClick}
    />
  );
}

export const gaugePlugin = defineChartPlugin({
  type: "gauge",
  label: "Gauge",
  component: GaugePluginComponent,
  transform: transformToGaugeData,
  transformWithMapping: transformToGaugeData,
  options: getChartOptions("gauge"),
  compatibleWith: ["neo4j", "postgresql"],
  settingsSchema: gaugeSettingsSchema,
  stylingTargets: [{ value: "color", label: "Gauge Color" }],
  capabilities: {
    supportsClickAction: true,
    supportsStyling: true,
    isECharts: true,
    requiresQuery: true,
  },
  queryHint:
    "Return 1-2 columns: first = numeric value, optional second = name/label.\n" +
    "Example: RETURN progress AS value, 'Completion' AS name",
});
