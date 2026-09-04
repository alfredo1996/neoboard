/**
 * Pie / Doughnut chart plugin.
 *
 * Proportional slices for part-to-whole comparisons. Supports donut mode,
 * rose (nightingale), top-N truncation, and scrollable legend.
 */

import dynamic from "next/dynamic";
import { Skeleton, getChartOptions } from "@neoboard/components";
import type { PieChartDataPoint, StylingRule } from "@neoboard/components";
import { defineChartPlugin } from "../registry";
import { transformToPieData, validatePieData } from "./transform";
import { useEChartsClick, type PluginProps } from "../utils";
import { pieSettingsSchema } from "./settings";
import { safeParseSettings } from "@/lib/plugin/safe-parse-settings";

const PieChart = dynamic(
  () => import("@neoboard/components").then((m) => ({ default: m.PieChart })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> },
);

function PiePluginComponent({
  data,
  settings: raw,
  stylingRules,
  paramValues,
  onChartClick,
}: PluginProps) {
  const onClick = useEChartsClick(onChartClick, data);
  const settings = safeParseSettings(pieSettingsSchema, raw, "pie");
  return (
    <PieChart
      data={(data as PieChartDataPoint[]) ?? []}
      donut={settings.donut}
      showLabel={settings.showLabel}
      showLegend={settings.showLegend}
      decimalPlaces={settings.decimalPlaces}
      roseMode={settings.roseMode}
      labelPosition={settings.labelPosition}
      showPercentage={settings.showPercentage}
      sortSlices={settings.sortSlices}
      topN={settings.topN}
      donutCenterText={settings.donutCenterText}
      stylingRules={stylingRules as StylingRule[] | undefined}
      paramValues={paramValues}
      onClick={onClick}
      colorPalette={settings.colorPalette}
      colorblindMode={settings.colorblindMode}
    />
  );
}

export const piePlugin = defineChartPlugin({
  type: "pie",
  label: "Pie Chart",
  component: PiePluginComponent,
  transform: transformToPieData,
  transformWithMapping: transformToPieData,
  validate: validatePieData,
  options: getChartOptions("pie"),
  compatibleWith: ["neo4j", "postgresql"],
  settingsSchema: pieSettingsSchema,
  stylingTargets: [{ value: "color", label: "Slice Color" }],
  capabilities: {
    supportsClickAction: true,
    supportsStyling: true,
    isECharts: true,
    requiresQuery: true,
  },
  queryHint:
    "Return 2 columns: first = slice label (string), second = numeric value.\n" +
    "Example: RETURN category, count(*) AS total",
});
