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
  SlidersHorizontal,
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
  {
    type: "bar",
    label: "Bar",
    icon: <BarChart3 className="h-5 w-5" />,
    description: "Compare categories",
  },
  {
    type: "line",
    label: "Line",
    icon: <LineChartIcon className="h-5 w-5" />,
    description: "Show trends",
  },
  {
    type: "pie",
    label: "Pie",
    icon: <PieChartIcon className="h-5 w-5" />,
    description: "Show proportions",
  },
  {
    type: "single-value",
    label: "Value",
    icon: <Hash className="h-5 w-5" />,
    description: "Single metric",
  },
  {
    type: "graph",
    label: "Graph",
    icon: <GitGraph className="h-5 w-5" />,
    description: "Node-link",
  },
  {
    type: "map",
    label: "Map",
    icon: <Map className="h-5 w-5" />,
    description: "Geographic data",
  },
  {
    type: "table",
    label: "Table",
    icon: <Table2 className="h-5 w-5" />,
    description: "Data table",
  },
  {
    type: "json",
    label: "JSON",
    icon: <Braces className="h-5 w-5" />,
    description: "Raw data view",
  },
  {
    type: "parameter-select",
    label: "Param",
    icon: <SlidersHorizontal className="h-5 w-5" />,
    description: "Filter control",
  },
];

function ChartTypePicker({
  value,
  onValueChange,
  options = defaultOptions,
  className,
}: ChartTypePickerProps) {
  const btnRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const selectedIndex = options.findIndex((o) => o.type === value);
  // Roving tabindex: the checked radio is the single tab stop; if nothing is
  // selected yet, the first option takes it (WAI-ARIA radiogroup pattern).
  const tabStop = selectedIndex === -1 ? 0 : selectedIndex;

  function handleKeyDown(e: React.KeyboardEvent, index: number) {
    let next: number;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = (index + 1) % options.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = (index - 1 + options.length) % options.length;
        break;
      default:
        return;
    }
    e.preventDefault();
    onValueChange?.(options[next].type);
    btnRefs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Chart type"
      className={cn("grid grid-cols-4 gap-2", className)}
    >
      {options.map((option, index) => {
        const checked = value === option.type;
        return (
          <button
            key={option.type}
            ref={(el) => {
              btnRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={index === tabStop ? 0 : -1}
            onClick={() => onValueChange?.(option.type)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg border p-3 text-center transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              checked
                ? "border-primary bg-accent text-accent-foreground"
                : "border-border",
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
        );
      })}
    </div>
  );
}

export { ChartTypePicker };
