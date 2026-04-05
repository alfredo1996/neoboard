/**
 * Sankey chart plugin.
 *
 * Flow diagram showing how items move from one category to another.
 * Supports click actions and rule-based styling.
 */

import dynamic from "next/dynamic";
import { Skeleton } from "@neoboard/components";
import type {
  SankeyChartData,
  EChartsClickEvent,
  StylingRule,
} from "@neoboard/components";
import { defineChartPlugin } from "./registry";
import { chartRegistry } from "@/lib/chart-registry";

const SankeyChart = dynamic(
  () =>
    import("@neoboard/components").then((m) => ({ default: m.SankeyChart })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> },
);

interface PluginComponentProps {
  data: unknown;
  settings: Record<string, unknown>;
  stylingRules?: StylingRule[];
  paramValues?: Record<string, unknown>;
  onClick?: (e: EChartsClickEvent) => void;
}

function SankeyPluginComponent({
  data,
  settings,
  stylingRules,
  paramValues,
  onClick,
}: PluginComponentProps) {
  const sankeyData = (data as SankeyChartData) ?? { nodes: [], links: [] };
  return (
    <SankeyChart
      data={sankeyData}
      orient={settings.orient as "horizontal" | "vertical" | undefined}
      showLabels={settings.showLabels as boolean | undefined}
      nodeWidth={settings.nodeWidth as number | undefined}
      nodeGap={settings.nodeGap as number | undefined}
      colorPalette={settings.colorPalette as string | undefined}
      stylingRules={stylingRules}
      paramValues={paramValues}
      onClick={onClick}
      colorblindMode={settings.colorblindMode as boolean | undefined}
    />
  );
}

export const sankeyPlugin = defineChartPlugin({
  type: "sankey",
  label: "Sankey",
  component: SankeyPluginComponent,
  transform: chartRegistry.sankey.transform,
  transformWithMapping: chartRegistry.sankey.transformWithMapping,
  validate: chartRegistry.sankey.validate,
  compatibleWith: ["neo4j", "postgresql"],
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
