import * as React from "react";
import {
  BarChart3,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  Hash,
  GitGraph,
  Map,
  Table2,
  Braces,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChartTypeOption {
  type: string;
  label: string;
  icon?: React.ReactNode;
  description?: string;
}

export interface ChartTypePickerProps {
  value?: string;
  onValueChange?: (type: string) => void;
  options?: ChartTypeOption[];
  className?: string;
}

const defaultOptions: ChartTypeOption[] = [
  { type: "bar", label: "Bar", icon: <BarChart3 className="h-5 w-5" />, description: "Compare categories" },
  { type: "line", label: "Line", icon: <LineChartIcon className="h-5 w-5" />, description: "Show trends" },
  { type: "pie", label: "Pie", icon: <PieChartIcon className="h-5 w-5" />, description: "Show proportions" },
  { type: "single-value", label: "Value", icon: <Hash className="h-5 w-5" />, description: "Single metric" },
  { type: "graph", label: "Graph", icon: <GitGraph className="h-5 w-5" />, description: "Node-link" },
  { type: "map", label: "Map", icon: <Map className="h-5 w-5" />, description: "Geographic data" },
  { type: "table", label: "Table", icon: <Table2 className="h-5 w-5" />, description: "Data table" },
  { type: "json", label: "JSON", icon: <Braces className="h-5 w-5" />, description: "Raw data view" },
];

function ChartTypePicker({
  value,
  onValueChange,
  options = defaultOptions,
  className,
}: ChartTypePickerProps) {
  return (
    <div className={cn("grid grid-cols-4 gap-2", className)}>
      {options.map((option) => (
        <button
          key={option.type}
          type="button"
          onClick={() => onValueChange?.(option.type)}
          className={cn(
            "flex flex-col items-center gap-1 rounded-lg border p-3 text-center transition-colors hover:bg-accent",
            value === option.type
              ? "border-primary bg-accent text-accent-foreground"
              : "border-border"
          )}
        >
          {option.icon && (
            <span className="text-muted-foreground">{option.icon}</span>
          )}
          <span className="text-xs font-medium">{option.label}</span>
          {option.description && (
            <span className="text-[10px] text-muted-foreground leading-tight">
              {option.description}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export { ChartTypePicker };
