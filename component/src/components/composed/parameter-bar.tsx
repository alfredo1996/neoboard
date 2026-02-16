import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ParameterBarProps {
  children: ReactNode;
  orientation?: "horizontal" | "vertical";
  onApply?: () => void;
  onReset?: () => void;
  applyLabel?: string;
  resetLabel?: string;
  className?: string;
}

function ParameterBar({
  children,
  orientation = "horizontal",
  onApply,
  onReset,
  applyLabel = "Apply",
  resetLabel = "Reset",
  className,
}: ParameterBarProps) {
  const isVertical = orientation === "vertical";

  return (
    <div
      className={cn(
        "flex gap-3 items-center",
        isVertical && "flex-col items-stretch",
        !isVertical && "border-b pb-3",
        isVertical && "border-r pr-3",
        className
      )}
      data-orientation={orientation}
    >
      <div
        className={cn(
          "flex gap-3 flex-1",
          isVertical ? "flex-col" : "flex-row flex-wrap items-center"
        )}
      >
        {children}
      </div>
      {(onApply || onReset) && (
        <div className={cn("flex gap-2 shrink-0", isVertical && "flex-row justify-end")}>
          {onReset && (
            <Button type="button" variant="outline" size="sm" onClick={onReset}>
              {resetLabel}
            </Button>
          )}
          {onApply && (
            <Button type="button" size="sm" onClick={onApply}>
              {applyLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export { ParameterBar };
