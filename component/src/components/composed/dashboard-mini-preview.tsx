import { cn } from "../../lib/utils";
import { chartTypePreviewColors } from "../../lib/design-tokens";

export interface MiniPreviewWidget {
  x: number;
  y: number;
  w: number;
  h: number;
  chartType: string;
  /** JPEG data-URI thumbnail captured on last save. */
  thumbnailUrl?: string;
}

export interface DashboardMiniPreviewProps {
  widgets: MiniPreviewWidget[];
  className?: string;
}

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
            "rounded-sm border border-border/30 overflow-hidden",
            !w.thumbnailUrl && (chartTypePreviewColors[w.chartType] ?? "bg-muted")
          )}
          style={{
            gridColumn: `${w.x + 1} / span ${w.w}`,
            gridRow: `${w.y + 1} / span ${w.h}`,
          }}
        >
          {w.thumbnailUrl && (
            <img
              src={w.thumbnailUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          )}
        </div>
      ))}
    </div>
  );
}
