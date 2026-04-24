/**
 * Gantt chart plugin.
 *
 * Timeline chart showing tasks as horizontal bars on a time axis.
 * Supports click actions, rule-based styling, and progress overlays.
 */

import dynamic from "next/dynamic";
import { Skeleton, getChartOptions } from "@neoboard/components";
import type { GanttDataItem, StylingRule } from "@neoboard/components";
import { defineChartPlugin } from "../registry";
import { transformToGanttData } from "./transform";
import { useEChartsClick, type PluginProps } from "../utils";
import { ganttSettingsSchema } from "./settings";

const GanttChart = dynamic(
  () => import("@neoboard/components").then((m) => ({ default: m.GanttChart })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> },
);

function GanttPluginComponent({
  data,
  settings: raw,
  stylingRules,
  paramValues,
  onChartClick,
}: PluginProps) {
  const onClick = useEChartsClick(onChartClick, data);
  const settings = ganttSettingsSchema.parse(raw);
  return (
    <GanttChart
      data={(data as GanttDataItem[]) ?? []}
      showTodayLine={settings.showTodayLine}
      showProgress={settings.showProgress}
      showGridLines={settings.showGridLines}
      barBorderRadius={settings.barBorderRadius}
      colorPalette={settings.colorPalette}
      stylingRules={stylingRules as StylingRule[] | undefined}
      paramValues={paramValues}
      colorblindMode={settings.colorblindMode}
      onClick={onClick}
    />
  );
}

export const ganttPlugin = defineChartPlugin({
  type: "gantt",
  label: "Gantt",
  component: GanttPluginComponent,
  transform: transformToGanttData,
  transformWithMapping: transformToGanttData,
  options: getChartOptions("gantt"),
  compatibleWith: ["neo4j", "postgresql"],
  settingsSchema: ganttSettingsSchema,
  stylingTargets: [{ value: "color", label: "Bar Color" }],
  capabilities: {
    supportsClickAction: true,
    supportsStyling: true,
    isECharts: true,
    requiresQuery: true,
  },
  queryHint:
    "Return columns: task name, start date, end date. Optional: category/status, progress (0-1).\n" +
    "Example: SELECT task_name, start_date, end_date, status FROM projects",
});
