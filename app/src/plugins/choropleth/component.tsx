/**
 * Choropleth map plugin.
 *
 * World map with countries colored by data value.
 */

import dynamic from "next/dynamic";
import { Skeleton, getChartOptions } from "@neoboard/components";
import type { ChoroplethDataItem } from "@neoboard/components";
import { defineChartPlugin } from "../registry";
import { transformToChoroplethData } from "./transform";
import { useEChartsClick, type PluginProps } from "../utils";
import { choroplethSettingsSchema } from "./settings";
import { safeParseSettings } from "@/lib/plugin/safe-parse-settings";

const ChoroplethChart = dynamic(
  () =>
    import("@neoboard/components").then((m) => ({
      default: m.ChoroplethChart,
    })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> },
);

function ChoroplethPluginComponent({
  data,
  settings: raw,
  onChartClick,
}: PluginProps) {
  const onClick = useEChartsClick(onChartClick, data);
  const settings = safeParseSettings(
    choroplethSettingsSchema,
    raw,
    "choropleth",
  );
  return (
    <ChoroplethChart
      data={(data as ChoroplethDataItem[]) ?? []}
      showLabels={settings.showLabels}
      showVisualMap={settings.showVisualMap}
      roam={settings.roam}
      minColor={settings.minColor}
      maxColor={settings.maxColor}
      colorPalette={settings.colorPalette}
      colorblindMode={settings.colorblindMode}
      onClick={onClick}
    />
  );
}

export const choroplethPlugin = defineChartPlugin({
  type: "choropleth",
  label: "Choropleth Map",
  component: ChoroplethPluginComponent,
  transform: transformToChoroplethData,
  transformWithMapping: transformToChoroplethData,
  options: getChartOptions("choropleth"),
  compatibleWith: ["neo4j", "postgresql"],
  settingsSchema: choroplethSettingsSchema,
  capabilities: {
    supportsClickAction: true,
    supportsStyling: false,
    isECharts: true,
    requiresQuery: true,
  },
  queryHint:
    "Return 2 columns: country/region name + numeric value.\n" +
    "Example: SELECT country, population FROM demographics",
});
