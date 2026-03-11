import { type ReactNode, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface ParameterBarProps {
  children: ReactNode;
  orientation?: "horizontal" | "vertical";
  onApply?: () => void;
  onReset?: () => void;
  applyLabel?: string;
  resetLabel?: string;
  className?: string;
  /** When true, renders a collapse/expand toggle button. */
  collapsible?: boolean;
  /** Start in collapsed state. Only effective when `collapsible` is true. */
  defaultCollapsed?: boolean;
  /** Number of active parameters — shown as a badge when collapsed. */
  parameterCount?: number;
}

function ParameterBar({
  children,
  orientation = "horizontal",
  onApply,
  onReset,
  applyLabel = "Apply",
  resetLabel = "Reset",
  className,
  collapsible = false,
  defaultCollapsed = false,
  parameterCount,
}: ParameterBarProps) {
  const isVertical = orientation === "vertical";
  const [collapsed, setCollapsed] = useState(collapsible && defaultCollapsed);

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
      {collapsible && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => setCollapsed((prev) => !prev)}
          aria-label={collapsed ? "Expand parameters" : "Collapse parameters"}
        >
          {collapsed ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
        </Button>
      )}

      {collapsed && parameterCount != null && parameterCount > 0 && (
        <Badge variant="secondary" className="shrink-0">
          {parameterCount}
        </Badge>
      )}

      {!collapsed && (
        <>
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
        </>
      )}
    </div>
  );
}

export { ParameterBar };
