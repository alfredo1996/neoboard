import { cn } from "@/lib/utils";

export interface GraphLegendItem {
  label: string;
  color: string;
  count?: number;
  visible?: boolean;
}

export interface GraphLegendProps {
  items: GraphLegendItem[];
  onToggle?: (label: string, visible: boolean) => void;
  orientation?: "horizontal" | "vertical";
  className?: string;
}

function GraphLegend({
  items,
  onToggle,
  orientation = "vertical",
  className,
}: GraphLegendProps) {
  return (
    <div
      className={cn(
        "flex gap-1",
        orientation === "vertical" ? "flex-col" : "flex-row flex-wrap",
        className
      )}
      role="list"
      aria-label="Graph legend"
    >
      {items.map((item) => {
        const isVisible = item.visible !== false;
        const interactive = !!onToggle;

        return (
          <button
            key={item.label}
            type="button"
            role="listitem"
            className={cn(
              "flex items-center gap-2 rounded px-2 py-1 text-sm transition-colors",
              interactive && "hover:bg-muted cursor-pointer",
              !interactive && "cursor-default",
              !isVisible && "opacity-40"
            )}
            onClick={() => onToggle?.(item.label, !isVisible)}
            disabled={!interactive}
          >
            <span
              className="h-3 w-3 rounded-sm shrink-0"
              style={{ backgroundColor: isVisible ? item.color : "transparent", border: `2px solid ${item.color}` }}
              aria-hidden="true"
            />
            <span className="truncate">{item.label}</span>
            {item.count !== undefined && (
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export { GraphLegend };
