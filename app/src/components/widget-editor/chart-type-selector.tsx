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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
  const chartTypeSelect = (
    <div className="space-y-1.5">
      <Label>Chart Type</Label>
      <Select value={chartType} onValueChange={onChartTypeChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select chart type..." />
        </SelectTrigger>
        <SelectContent>
          {compatibleChartTypes.map((type) => {
            const meta = chartTypeMeta[type];
            const Icon = meta.Icon;
            return (
              <SelectItem key={type} value={type}>
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {meta.label}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
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
