/**
 * Pie / Doughnut chart plugin.
 *
 * Proportional slices for part-to-whole comparisons. Supports donut mode,
 * rose (nightingale), top-N truncation, and scrollable legend.
 */

import dynamic from "next/dynamic";
import { Skeleton } from "@neoboard/components";
import type {
  PieChartDataPoint,
  EChartsClickEvent,
  StylingRule,
} from "@neoboard/components";
import { defineChartPlugin } from "./registry";
import { chartRegistry } from "@/lib/chart-registry";

const PieChart = dynamic(
  () => import("@neoboard/components").then((m) => ({ default: m.PieChart })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> },
);

interface PluginComponentProps {
  data: unknown;
  settings: Record<string, unknown>;
  stylingRules?: StylingRule[];
  paramValues?: Record<string, unknown>;
  onClick?: (e: EChartsClickEvent) => void;
  colorThresholds?: string;
}

function PiePluginComponent({
  data,
  settings,
  stylingRules,
  paramValues,
  onClick,
  colorThresholds,
}: PluginComponentProps) {
  return (
    <PieChart
      data={(data as PieChartDataPoint[]) ?? []}
      donut={settings.donut as boolean | undefined}
      showLabel={settings.showLabel as boolean | undefined}
      showLegend={settings.showLegend as boolean | undefined}
      roseMode={settings.roseMode as boolean | undefined}
      labelPosition={
        settings.labelPosition as "outside" | "inside" | "center" | undefined
      }
      showPercentage={settings.showPercentage as boolean | undefined}
      sortSlices={settings.sortSlices as boolean | undefined}
      topN={settings.topN as number | undefined}
      donutCenterText={settings.donutCenterText as string | undefined}
      colorThresholds={colorThresholds}
      stylingRules={stylingRules}
      paramValues={paramValues}
      onClick={onClick}
      colorPalette={settings.colorPalette as string | undefined}
      colorblindMode={settings.colorblindMode as boolean | undefined}
    />
  );
}

export const piePlugin = defineChartPlugin({
  type: "pie",
  label: "Pie / Doughnut",
  component: PiePluginComponent,
  transform: chartRegistry.pie.transform,
  transformWithMapping: chartRegistry.pie.transformWithMapping,
  validate: chartRegistry.pie.validate,
  compatibleWith: ["neo4j", "postgresql"],
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
