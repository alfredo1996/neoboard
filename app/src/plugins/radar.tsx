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
import { chartRegistry } from "@/lib/chart-registry";

const RadarChart = dynamic(
  () => import("@neoboard/components").then((m) => ({ default: m.RadarChart })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> },
);

interface PluginComponentProps {
  data: unknown;
  settings: Record<string, unknown>;
  stylingRules?: StylingRule[];
  paramValues?: Record<string, unknown>;
}

function RadarPluginComponent({
  data,
  settings,
  stylingRules,
  paramValues,
}: PluginComponentProps) {
  const radarData = (data as RadarChartData) ?? {
    indicators: [],
    series: [],
  };
  return (
    <RadarChart
      data={radarData}
      shape={settings.shape as "polygon" | "circle" | undefined}
      filled={settings.filled as boolean | undefined}
      showLegend={settings.showLegend as boolean | undefined}
      showValues={settings.showValues as boolean | undefined}
      colorPalette={settings.colorPalette as string | undefined}
      stylingRules={stylingRules}
      paramValues={paramValues}
      colorblindMode={settings.colorblindMode as boolean | undefined}
    />
  );
}

export const radarPlugin = defineChartPlugin({
  type: "radar",
  label: "Radar",
  component: RadarPluginComponent,
  transform: chartRegistry.radar.transform,
  transformWithMapping: chartRegistry.radar.transformWithMapping,
  validate: chartRegistry.radar.validate,
  compatibleWith: ["neo4j", "postgresql"],
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
