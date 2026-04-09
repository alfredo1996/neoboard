"use client";

import {
  BarChart3,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  Hash,
  GitGraph,
  Map,
  Table2,
  Braces,
  SlidersHorizontal,
  FileEdit,
  FileText,
  Globe,
  Gauge,
  Workflow,
  Sun,
  Radar,
  LayoutGrid,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Label, Combobox } from "@neoboard/components";
import type { ChartType } from "@/lib/plugin/chart-helpers";
import { getChartConfig } from "@/lib/plugin/chart-helpers";

/** Icon map for chart type dropdown (labels come from chartRegistry, icons stay in UI layer) */
export const chartTypeIcons: Record<ChartType, LucideIcon> = {
  bar: BarChart3,
  line: LineChartIcon,
  pie: PieChartIcon,
  "single-value": Hash,
  graph: GitGraph,
  map: Map,
  table: Table2,
  json: Braces,
  "parameter-select": SlidersHorizontal,
  form: FileEdit,
  markdown: FileText,
  iframe: Globe,
  gauge: Gauge,
  sankey: Workflow,
  sunburst: Sun,
  radar: Radar,
  treemap: LayoutGrid,
};

/** Get label + Icon for a chart type. Label from registry, Icon from UI layer. */
export function getChartTypeMeta(type: ChartType): {
  label: string;
  Icon: LucideIcon;
} {
  return {
    label: getChartConfig(type)?.label ?? type,
    Icon: chartTypeIcons[type] ?? Braces,
  };
}

interface ConnectionOption {
  id: string;
  name: string;
  type: string;
}

export interface ChartTypeSelectorProps {
  connectionId: string;
  onConnectionChange: (id: string) => void;
  chartType: string;
  onChartTypeChange: (type: string) => void;
  compatibleChartTypes: ChartType[];
  connections: ConnectionOption[];
  showConnection: boolean;
}

export function ChartTypeSelector({
  connectionId,
  onConnectionChange,
  chartType,
  onChartTypeChange,
  compatibleChartTypes,
  connections,
  showConnection,
}: ChartTypeSelectorProps) {
  const chartTypeOptions = compatibleChartTypes.map((type) => {
    const meta = getChartTypeMeta(type);
    return {
      value: type,
      label: meta.label,
      icon: meta.Icon,
    };
  });

  const chartTypeSelect = (
    <div className="space-y-1.5">
      <Label>Chart Type</Label>
      <Combobox
        value={chartType}
        onChange={onChartTypeChange}
        options={chartTypeOptions}
        placeholder="Select chart type..."
        searchPlaceholder="Search chart types..."
        emptyText="No chart types found."
        className="w-full"
      />
    </div>
  );

  if (!showConnection) {
    return chartTypeSelect;
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label>
          Connection <span className="text-destructive">*</span>
        </Label>
        <Combobox
          value={connectionId}
          onChange={onConnectionChange}
          options={connections.map((c) => ({
            value: c.id,
            label: `${c.name} (${c.type})`,
          }))}
          placeholder="Select a connection..."
          searchPlaceholder="Search connections..."
          emptyText="No connections found."
          className="w-full"
        />
      </div>
      {chartTypeSelect}
    </div>
  );
}
