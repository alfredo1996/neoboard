/**
 * Gauge chart plugin.
 *
 * Radial gauge displaying a single value against a configurable range.
 * Supports click actions and rule-based styling.
 */

import dynamic from "next/dynamic";
import { Skeleton } from "@neoboard/components";
import type { GaugeDataPoint, StylingRule } from "@neoboard/components";
import { defineChartPlugin } from "./registry";
import { chartRegistry } from "@/lib/chart-registry";
import { useEChartsClick, type PluginProps } from "./utils";

const GaugeChart = dynamic(
  () => import("@neoboard/components").then((m) => ({ default: m.GaugeChart })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> },
);

function GaugePluginComponent({
  data,
  settings,
  stylingRules,
  paramValues,
  onChartClick,
}: PluginProps) {
  const onClick = useEChartsClick(onChartClick, data);
  return (
    <GaugeChart
      data={(data as GaugeDataPoint[]) ?? []}
      min={settings.min as number | undefined}
      max={settings.max as number | undefined}
      showProgress={settings.showProgress as boolean | undefined}
      showPointer={settings.showPointer as boolean | undefined}
      showDetail={settings.showDetail as boolean | undefined}
      startAngle={settings.startAngle as number | undefined}
      endAngle={settings.endAngle as number | undefined}
      colorPalette={settings.colorPalette as string | undefined}
      stylingRules={stylingRules as StylingRule[] | undefined}
      paramValues={paramValues}
      colorblindMode={settings.colorblindMode as boolean | undefined}
      onClick={onClick}
    />
  );
}

export const gaugePlugin = defineChartPlugin({
  type: "gauge",
  label: "Gauge",
  component: GaugePluginComponent,
  transform: chartRegistry.gauge.transform,
  transformWithMapping: chartRegistry.gauge.transformWithMapping,
  validate: chartRegistry.gauge.validate,
  compatibleWith: ["neo4j", "postgresql"],
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
