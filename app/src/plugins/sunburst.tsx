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
import { transformToHierarchicalData } from "./transforms/sunburst";
import { useEChartsClick, type PluginProps } from "./utils";
import { sunburstSettingsSchema } from "./settings/sunburst";

const SunburstChart = dynamic(
  () =>
    import("@neoboard/components").then((m) => ({ default: m.SunburstChart })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> },
);

function SunburstPluginComponent({
  data,
  settings: raw,
  stylingRules,
  paramValues,
  onChartClick,
}: PluginProps) {
  const onClick = useEChartsClick(onChartClick, data);
  const settings = sunburstSettingsSchema.parse(raw);
  return (
    <SunburstChart
      data={(data as SunburstDataItem[]) ?? []}
      showLabels={settings.showLabels}
      sort={settings.sort}
      highlightOnHover={settings.highlightOnHover}
      colorPalette={settings.colorPalette}
      stylingRules={stylingRules as StylingRule[] | undefined}
      paramValues={paramValues}
      onClick={onClick}
      colorblindMode={settings.colorblindMode}
    />
  );
}

export const sunburstPlugin = defineChartPlugin({
  type: "sunburst",
  label: "Sunburst",
  component: SunburstPluginComponent,
  transform: transformToHierarchicalData,
  transformWithMapping: transformToHierarchicalData,
  compatibleWith: ["neo4j", "postgresql"],
  settingsSchema: sunburstSettingsSchema,
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
