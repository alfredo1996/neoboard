/**
 * Table widget plugin.
 *
 * Auto-paginated data grid with sorting, filtering, and per-cell styling.
 * Supports click actions (per-cell) and rule-based styling (backgroundColor,
 * textColor) plus gradient color scales.
 */

import type { StylingRule, ColorScaleConfig } from "@neoboard/components";
import { TableRenderer } from "@/components/table-renderer";
import { defineChartPlugin } from "./registry";
import { chartRegistry } from "@/lib/chart-registry";

interface PluginComponentProps {
  data: unknown;
  settings: Record<string, unknown>;
  stylingRules?: StylingRule[];
  paramValues?: Record<string, unknown>;
  colorScales?: ColorScaleConfig[];
  clickableColumns?: string[];
  onChartClick?: (point: Record<string, unknown>) => void;
}

function TablePluginComponent({
  data,
  settings,
  stylingRules,
  paramValues,
  colorScales,
  clickableColumns,
  onChartClick,
}: PluginComponentProps) {
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
      stylingRules={stylingRules}
      paramValues={paramValues}
      colorScales={colorScales}
    />
  );
}

export const tablePlugin = defineChartPlugin({
  type: "table",
  label: "Data Table",
  component: TablePluginComponent,
  transform: chartRegistry.table.transform,
  transformWithMapping: chartRegistry.table.transformWithMapping,
  validate: chartRegistry.table.validate,
  compatibleWith: ["neo4j", "postgresql"],
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
