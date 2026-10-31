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
  GanttChart as GanttChartIcon,
  MapPin,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Combobox, SettingRow } from "@neoboard/components";
import type { ChartType } from "@/lib/plugin/chart-helpers";
import { getChartConfig } from "@/lib/plugin/chart-helpers";
import { useConnectors } from "@/hooks/use-connectors";
import { connectorLabel } from "@/lib/connector/connector-label";

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
  gantt: GanttChartIcon,
  choropleth: MapPin,
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

export interface ChartTypeSelectProps {
  chartType: string;
  onChartTypeChange: (type: string) => void;
  compatibleChartTypes: ChartType[];
  className?: string;
}

/** The chart type, in the editor's header where every section can see it (#2388). */
export function ChartTypeSelect({
  chartType,
  onChartTypeChange,
  compatibleChartTypes,
  className,
}: Readonly<ChartTypeSelectProps>) {
  const chartTypeOptions = compatibleChartTypes.map((type) => {
    const meta = getChartTypeMeta(type);
    return {
      value: type,
      label: meta.label,
      icon: meta.Icon,
    };
  });
  return (
    <Combobox
      aria-label="Chart Type"
      value={chartType}
      onChange={onChartTypeChange}
      options={chartTypeOptions}
      placeholder="Select chart type..."
      searchPlaceholder="Search chart types..."
      emptyText="No chart types found."
      className={className}
    />
  );
}

export interface ConnectionSelectProps {
  connectionId: string;
  onConnectionChange: (id: string) => void;
  connections: ConnectionOption[];
}

/** The connection, as a row of the Query group. */
export function ConnectionSelect({
  connectionId,
  onConnectionChange,
  connections,
}: Readonly<ConnectionSelectProps>) {
  const { data: connectors } = useConnectors();
  return (
    <SettingRow label="Connection" htmlFor="editor-connection">
      <Combobox
        id="editor-connection"
        value={connectionId}
        onChange={onConnectionChange}
        options={connections.map((c) => ({
          value: c.id,
          label: c.name,
          hint: connectorLabel(connectors, c.type),
        }))}
        placeholder="Select a connection..."
        searchPlaceholder="Search connections..."
        emptyText="No connections found."
        className="w-full"
      />
    </SettingRow>
  );
}
