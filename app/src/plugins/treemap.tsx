/**
 * Treemap chart plugin.
 *
 * Hierarchical rectangles — each block's area is proportional to its value.
 * Supports click actions, drilldown, and rule-based styling.
 */

import dynamic from "next/dynamic";
import { Skeleton } from "@neoboard/components";
import type { TreemapDataItem, StylingRule } from "@neoboard/components";
import { defineChartPlugin } from "./registry";
import { chartRegistry } from "@/lib/chart-registry";
import { useEChartsClick, type PluginProps } from "./utils";

const TreemapChart = dynamic(
  () =>
    import("@neoboard/components").then((m) => ({ default: m.TreemapChart })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> },
);

function TreemapPluginComponent({
  data,
  settings,
  stylingRules,
  paramValues,
  onChartClick,
}: PluginProps) {
  const onClick = useEChartsClick(onChartClick, data);
  return (
    <TreemapChart
      data={(data as TreemapDataItem[]) ?? []}
      showLabels={settings.showLabels as boolean | undefined}
      showBreadcrumb={settings.showBreadcrumb as boolean | undefined}
      showValues={settings.showValues as boolean | undefined}
      colorSaturation={
        settings.colorSaturation as "low" | "medium" | "high" | undefined
      }
      colorPalette={settings.colorPalette as string | undefined}
      stylingRules={stylingRules as StylingRule[] | undefined}
      paramValues={paramValues}
      onClick={onClick}
      colorblindMode={settings.colorblindMode as boolean | undefined}
    />
  );
}

export const treemapPlugin = defineChartPlugin({
  type: "treemap",
  label: "Treemap",
  component: TreemapPluginComponent,
  transform: chartRegistry.treemap.transform,
  transformWithMapping: chartRegistry.treemap.transformWithMapping,
  validate: chartRegistry.treemap.validate,
  compatibleWith: ["neo4j", "postgresql"],
  stylingTargets: [{ value: "color", label: "Block Color" }],
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
