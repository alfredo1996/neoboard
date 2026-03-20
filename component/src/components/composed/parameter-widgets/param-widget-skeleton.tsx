import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface ParamWidgetSkeletonProps {
  /** Width of the label skeleton. Defaults to "w-20". */
  labelWidth?: string;
  className?: string;
}

/**
 * Shared loading skeleton for parameter widgets.
 * Shows a small label placeholder and a full-width input placeholder.
 */
function ParamWidgetSkeleton({
  labelWidth = "w-20",
  className,
}: ParamWidgetSkeletonProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Skeleton className={cn("h-3", labelWidth)} />
      <Skeleton className="h-9 w-full" />
    </div>
  );
}

export { ParamWidgetSkeleton };
