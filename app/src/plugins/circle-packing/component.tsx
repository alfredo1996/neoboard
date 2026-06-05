/**
 * Circle Packing chart plugin.
 *
 * Hierarchical data visualized as nested circles.
 * Shares the same transform as Sunburst and Treemap.
 */

import dynamic from "next/dynamic";
import { Skeleton, getChartOptions } from "@neoboard/components";
import type { CirclePackingDataItem, StylingRule } from "@neoboard/components";
import { defineChartPlugin } from "../registry";
import { transformToHierarchicalData } from "../sunburst/transform";
import { useEChartsClick, type PluginProps } from "../utils";
import { circlePackingSettingsSchema } from "./settings";
import { safeParseSettings } from "@/lib/plugin/safe-parse-settings";

const CirclePackingChart = dynamic(
  () =>
    import("@neoboard/components").then((m) => ({
      default: m.CirclePackingChart,
    })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> },
);

function CirclePackingPluginComponent({
  data,
  settings: raw,
  stylingRules,
  paramValues,
  onChartClick,
}: PluginProps) {
  const onClick = useEChartsClick(onChartClick, data);
  const settings = safeParseSettings(
    circlePackingSettingsSchema,
    raw,
    "circle-packing",
  );
  return (
    <CirclePackingChart
      data={(data as CirclePackingDataItem[]) ?? []}
      showLabels={settings.showLabels}
      padding={settings.padding}
      colorPalette={settings.colorPalette}
      stylingRules={stylingRules as StylingRule[] | undefined}
      paramValues={paramValues}
      colorblindMode={settings.colorblindMode}
      onClick={onClick}
    />
  );
}

export const circlePackingPlugin = defineChartPlugin({
  type: "circle-packing",
  label: "Circle Packing",
  component: CirclePackingPluginComponent,
  transform: transformToHierarchicalData,
  transformWithMapping: transformToHierarchicalData,
  options: getChartOptions("circle-packing"),
  compatibleWith: ["neo4j", "postgresql"],
  settingsSchema: circlePackingSettingsSchema,
  stylingTargets: [{ value: "color", label: "Circle Color" }],
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
