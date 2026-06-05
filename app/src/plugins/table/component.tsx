/**
 * Table widget plugin.
 *
 * Auto-paginated data grid with sorting, filtering, and per-cell styling.
 * Supports click actions (per-cell) and rule-based styling (backgroundColor,
 * textColor) plus gradient color scales.
 */

import { getChartOptions } from "@neoboard/components";
import type { StylingRule, ColorScaleConfig } from "@neoboard/components";
import { TableRenderer } from "@/components/table-renderer";
import { defineChartPlugin } from "../registry";
import { transformToTableData } from "./transform";
import { type PluginProps } from "../utils";
import { tableSettingsSchema } from "./settings";
import { safeParseSettings } from "@/lib/plugin/safe-parse-settings";

function TablePluginComponent({
  data,
  settings: raw,
  stylingRules,
  paramValues,
  colorScales,
  clickableColumns,
  onChartClick,
}: PluginProps) {
  const settings = safeParseSettings(tableSettingsSchema, raw, "table");
  return (
    <TableRenderer
      data={data}
      settings={settings}
      onCellClick={
        onChartClick
          ? (info) =>
              onChartClick({
                _clickedColumn: info.column,
                _clickedValue: info.value,
              })
          : undefined
      }
      clickableColumns={clickableColumns}
      stylingRules={stylingRules as StylingRule[] | undefined}
      paramValues={paramValues}
      colorScales={colorScales as ColorScaleConfig[] | undefined}
    />
  );
}

export const tablePlugin = defineChartPlugin({
  type: "table",
  label: "Data Table",
  component: TablePluginComponent,
  transform: transformToTableData,
  transformWithMapping: transformToTableData,
  options: getChartOptions("table"),
  compatibleWith: ["neo4j", "postgresql"],
  settingsSchema: tableSettingsSchema,
  stylingTargets: [
    { value: "backgroundColor", label: "Background Color" },
    { value: "textColor", label: "Text Color" },
  ],
  capabilities: {
    supportsClickAction: true,
    supportsStyling: true,
    isECharts: false,
    requiresQuery: true,
  },
  queryHint:
    "Return any tabular data — each column becomes a sortable grid column.\n" +
    "Example: RETURN name, created_at, status FROM users",
});
