/**
 * Sunburst chart plugin.
 *
 * Hierarchical radial chart — shows nested categories as concentric rings.
 * Supports click actions and rule-based styling.
 */

import dynamic from "next/dynamic";
import { Skeleton } from "@neoboard/components";
import type { SunburstDataItem, StylingRule } from "@neoboard/components";
import { defineChartPlugin } from "./registry";
import { chartRegistry } from "@/lib/chart-registry";
import { useEChartsClick, type PluginProps } from "./utils";

const SunburstChart = dynamic(
  () =>
    import("@neoboard/components").then((m) => ({ default: m.SunburstChart })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> },
);

function SunburstPluginComponent({
  data,
  settings,
  stylingRules,
  paramValues,
  onChartClick,
}: PluginProps) {
  const onClick = useEChartsClick(onChartClick, data);
  return (
    <SunburstChart
      data={(data as SunburstDataItem[]) ?? []}
      showLabels={settings.showLabels as boolean | undefined}
      sort={settings.sort as "desc" | "asc" | "none" | undefined}
      highlightOnHover={settings.highlightOnHover as boolean | undefined}
      colorPalette={settings.colorPalette as string | undefined}
      stylingRules={stylingRules as StylingRule[] | undefined}
      paramValues={paramValues}
      onClick={onClick}
      colorblindMode={settings.colorblindMode as boolean | undefined}
    />
  );
}

export const sunburstPlugin = defineChartPlugin({
  type: "sunburst",
  label: "Sunburst",
  component: SunburstPluginComponent,
  transform: chartRegistry.sunburst.transform,
  transformWithMapping: chartRegistry.sunburst.transformWithMapping,
  validate: chartRegistry.sunburst.validate,
  compatibleWith: ["neo4j", "postgresql"],
  stylingTargets: [{ value: "color", label: "Segment Color" }],
  capabilities: {
    supportsClickAction: true,
    supportsStyling: true,
    isECharts: true,
    requiresQuery: true,
  },
  queryHint:
    "Return hierarchical data — either pre-nested with children, or flat rows\n" +
    "with name/parent/value columns. Example: RETURN name, parent, value",
});
