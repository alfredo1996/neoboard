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
import { transformToHierarchicalData } from "./transforms/treemap";
import { useEChartsClick, type PluginProps } from "./utils";
import { treemapSettingsSchema } from "./settings/treemap";

const TreemapChart = dynamic(
  () =>
    import("@neoboard/components").then((m) => ({ default: m.TreemapChart })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> },
);

function TreemapPluginComponent({
  data,
  settings: raw,
  stylingRules,
  paramValues,
  onChartClick,
}: PluginProps) {
  const onClick = useEChartsClick(onChartClick, data);
  const settings = treemapSettingsSchema.parse(raw);
  return (
    <TreemapChart
      data={(data as TreemapDataItem[]) ?? []}
      showLabels={settings.showLabels}
      showBreadcrumb={settings.showBreadcrumb}
      showValues={settings.showValues}
      colorSaturation={settings.colorSaturation}
      colorPalette={settings.colorPalette}
      stylingRules={stylingRules as StylingRule[] | undefined}
      paramValues={paramValues}
      onClick={onClick}
      colorblindMode={settings.colorblindMode}
    />
  );
}

export const treemapPlugin = defineChartPlugin({
  type: "treemap",
  label: "Treemap",
  component: TreemapPluginComponent,
  transform: transformToHierarchicalData,
  transformWithMapping: transformToHierarchicalData,
  compatibleWith: ["neo4j", "postgresql"],
  settingsSchema: treemapSettingsSchema,
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
