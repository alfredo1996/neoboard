import { cn } from "../../lib/utils";

export interface MiniPreviewWidget {
  x: number;
  y: number;
  w: number;
  h: number;
  chartType: string;
}

export interface DashboardMiniPreviewProps {
  widgets: MiniPreviewWidget[];
  className?: string;
}

const chartTypeColors: Record<string, string> = {
  bar: "bg-blue-400/40",
  line: "bg-green-400/40",
  pie: "bg-amber-400/40",
  "single-value": "bg-purple-400/40",
  graph: "bg-cyan-400/40",
  map: "bg-emerald-400/40",
  table: "bg-slate-400/40",
  json: "bg-orange-400/40",
  "parameter-select": "bg-pink-400/40",
};

export function DashboardMiniPreview({
  widgets,
  className,
}: DashboardMiniPreviewProps) {
  if (!widgets.length) {
    return (
      <div
        className={cn(
          "aspect-[16/10] rounded-md border-2 border-dashed border-border/50 flex items-center justify-center",
          className
        )}
      >
        <span className="text-xs text-muted-foreground">No widgets</span>
      </div>
    );
  }

  // Compute the grid row count from the widget positions
  const maxRow = Math.max(...widgets.map((w) => w.y + w.h));

  return (
    <div
      className={cn(
        "aspect-[16/10] rounded-md bg-muted/20 overflow-hidden",
        className
      )}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(12, 1fr)",
        gridTemplateRows: `repeat(${maxRow}, 1fr)`,
        gap: "2px",
        padding: "2px",
      }}
    >
      {widgets.map((w, i) => (
        <div
          key={i}
          className={cn(
            "rounded-sm border border-border/30",
            chartTypeColors[w.chartType] ?? "bg-muted"
          )}
          style={{
            gridColumn: `${w.x + 1} / span ${w.w}`,
            gridRow: `${w.y + 1} / span ${w.h}`,
          }}
        />
      ))}
    </div>
  );
}
