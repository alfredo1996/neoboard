"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils";

/**
 * Progress bar (#1129 E1) — determinate when `value` is given, indeterminate
 * otherwise (a sliding accent segment; frozen under prefers-reduced-motion).
 */
const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => {
  const indeterminate = value === undefined || value === null;
  return (
    <ProgressPrimitive.Root
      ref={ref}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-primary/20",
        className,
      )}
      value={value}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          "h-full w-full flex-1 bg-primary transition-transform [transition-duration:var(--duration-fast)] [transition-timing-function:var(--ease-standard)]",
          indeterminate &&
            "animate-progress-indeterminate motion-reduce:animate-none",
        )}
        style={
          indeterminate
            ? undefined
            : { transform: `translateX(-${100 - (value ?? 0)}%)` }
        }
      />
    </ProgressPrimitive.Root>
  );
});
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
