/**
 * Bar chart plugin.
 *
 * Horizontal / vertical / stacked bars for comparing categories.
 * Supports click actions, rule-based styling, and axis data zoom.
 */

import dynamic from "next/dynamic";
import { Skeleton } from "@neoboard/components";
import type {
  BarChartDataPoint,
  EChartsClickEvent,
  StylingRule,
} from "@neoboard/components";
import { defineChartPlugin } from "./registry";
import { chartRegistry } from "@/lib/chart-registry";

// Charts use ECharts (browser APIs) — must be loaded client-side only
const BarChart = dynamic(
  () => import("@neoboard/components").then((m) => ({ default: m.BarChart })),
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

function BarPluginComponent({
  data,
  settings,
  stylingRules,
  paramValues,
  onClick,
  colorThresholds,
}: PluginComponentProps) {
  return (
    <BarChart
      data={(data as BarChartDataPoint[]) ?? []}
      orientation={
        settings.orientation as "vertical" | "horizontal" | undefined
      }
      stacked={settings.stacked as boolean | undefined}
      showValues={settings.showValues as boolean | undefined}
      showLegend={settings.showLegend as boolean | undefined}
      barWidth={settings.barWidth as number | undefined}
      barGap={settings.barGap as string | undefined}
      xAxisLabel={settings.xAxisLabel as string | undefined}
      yAxisLabel={settings.yAxisLabel as string | undefined}
      showGridLines={settings.showGridLines as boolean | undefined}
      axisLabelRotation={settings.axisLabelRotation as number | undefined}
      referenceLines={settings.referenceLines as string | undefined}
      colorThresholds={colorThresholds}
      stylingRules={stylingRules}
      paramValues={paramValues}
      onClick={onClick}
      enableDataZoom={settings.enableDataZoom as boolean | undefined}
      colorPalette={settings.colorPalette as string | undefined}
      colorblindMode={settings.colorblindMode as boolean | undefined}
    />
  );
}

export const barPlugin = defineChartPlugin({
  type: "bar",
  label: "Bar Chart",
  component: BarPluginComponent,
  transform: chartRegistry.bar.transform,
  transformWithMapping: chartRegistry.bar.transformWithMapping,
  validate: chartRegistry.bar.validate,
  compatibleWith: ["neo4j", "postgresql"],
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
