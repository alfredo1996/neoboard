/**
 * Radar chart plugin.
 *
 * Multi-axis chart comparing several quantitative variables. Supports
 * rule-based styling but not click actions.
 */

import dynamic from "next/dynamic";
import { Skeleton } from "@neoboard/components";
import type { RadarChartData, StylingRule } from "@neoboard/components";
import { defineChartPlugin } from "./registry";
import { transformToRadarData } from "./transforms/radar";
import { type PluginProps } from "./utils";
import { radarSettingsSchema } from "./settings/radar";

const RadarChart = dynamic(
  () => import("@neoboard/components").then((m) => ({ default: m.RadarChart })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> },
);

function RadarPluginComponent({
  data,
  settings: raw,
  stylingRules,
  paramValues,
}: PluginProps) {
  const radarData = (data as RadarChartData) ?? {
    indicators: [],
    series: [],
  };
  const settings = radarSettingsSchema.parse(raw);
  return (
    <RadarChart
      data={radarData}
      shape={settings.shape}
      filled={settings.filled}
      showLegend={settings.showLegend}
      showValues={settings.showValues}
      colorPalette={settings.colorPalette}
      stylingRules={stylingRules as StylingRule[] | undefined}
      paramValues={paramValues}
      colorblindMode={settings.colorblindMode}
    />
  );
}

export const radarPlugin = defineChartPlugin({
  type: "radar",
  label: "Radar",
  component: RadarPluginComponent,
  transform: transformToRadarData,
  transformWithMapping: transformToRadarData,
  compatibleWith: ["neo4j", "postgresql"],
  settingsSchema: radarSettingsSchema,
  stylingTargets: [{ value: "color", label: "Area Color" }],
  capabilities: {
    supportsClickAction: false,
    supportsStyling: true,
    isECharts: true,
    requiresQuery: true,
  },
  queryHint:
    "Return either long-format (indicator, value, [series], [max]) or\n" +
    "wide-format (one column per indicator). Example: RETURN axis, score, series",
});
