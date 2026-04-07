/**
 * Sankey chart plugin.
 *
 * Flow diagram showing how items move from one category to another.
 * Supports click actions and rule-based styling.
 */

import dynamic from "next/dynamic";
import { Skeleton, getChartOptions } from "@neoboard/components";
import type { SankeyChartData, StylingRule } from "@neoboard/components";
import { defineChartPlugin } from "./registry";
import { transformToSankeyData } from "./transforms/sankey";
import { useEChartsClick, type PluginProps } from "./utils";
import { sankeySettingsSchema } from "./settings/sankey";

const SankeyChart = dynamic(
  () =>
    import("@neoboard/components").then((m) => ({ default: m.SankeyChart })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> },
);

function SankeyPluginComponent({
  data,
  settings: raw,
  stylingRules,
  paramValues,
  onChartClick,
}: PluginProps) {
  const onClick = useEChartsClick(onChartClick, data);
  const settings = sankeySettingsSchema.parse(raw);
  const sankeyData = (data as SankeyChartData) ?? { nodes: [], links: [] };
  return (
    <SankeyChart
      data={sankeyData}
      orient={settings.orient}
      showLabels={settings.showLabels}
      nodeWidth={settings.nodeWidth}
      nodeGap={settings.nodeGap}
      colorPalette={settings.colorPalette}
      stylingRules={stylingRules as StylingRule[] | undefined}
      paramValues={paramValues}
      onClick={onClick}
      colorblindMode={settings.colorblindMode}
    />
  );
}

export const sankeyPlugin = defineChartPlugin({
  type: "sankey",
  label: "Sankey",
  component: SankeyPluginComponent,
  transform: transformToSankeyData,
  transformWithMapping: transformToSankeyData,
  options: getChartOptions("sankey"),
  compatibleWith: ["neo4j", "postgresql"],
  settingsSchema: sankeySettingsSchema,
  stylingTargets: [{ value: "color", label: "Link Color" }],
  capabilities: {
    supportsClickAction: true,
    supportsStyling: true,
    isECharts: true,
    requiresQuery: true,
  },
  queryHint:
    "Return 3 columns: source, target, value.\n" +
    "Example: RETURN fromNode AS source, toNode AS target, flow AS value",
});
