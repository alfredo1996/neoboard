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
import {
  Label,
  Combobox,
} from "@neoboard/components";
import type { ChartType } from "@/lib/chart-registry";

/** Icon + label map for chart type dropdown (keeps chart-registry free of UI concerns) */
export const chartTypeMeta: Record<ChartType, { label: string; Icon: LucideIcon }> = {
  bar: { label: "Bar Chart", Icon: BarChart3 },
  line: { label: "Line Chart", Icon: LineChartIcon },
  pie: { label: "Pie Chart", Icon: PieChartIcon },
  "single-value": { label: "Single Value", Icon: Hash },
  graph: { label: "Graph", Icon: GitGraph },
  map: { label: "Map", Icon: Map },
  table: { label: "Data Table", Icon: Table2 },
  json: { label: "JSON Viewer", Icon: Braces },
  "parameter-select": { label: "Parameter Selector", Icon: SlidersHorizontal },
  form: { label: "Form", Icon: FileEdit },
  markdown: { label: "Markdown", Icon: FileText },
  iframe: { label: "iFrame", Icon: Globe },
  gauge: { label: "Gauge", Icon: Gauge },
  sankey: { label: "Sankey", Icon: Workflow },
  sunburst: { label: "Sunburst", Icon: Sun },
  radar: { label: "Radar", Icon: Radar },
  treemap: { label: "Treemap", Icon: LayoutGrid },
};

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
  const chartTypeOptions = compatibleChartTypes.map((type) => ({
    value: type,
    label: chartTypeMeta[type].label,
  }));

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
        <Label>Connection <span className="text-destructive">*</span></Label>
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
