import * as React from "react";

import { cn } from "@/lib/utils";

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement>;

/**
 * A count: an 18px tabular-number box on the neutral fill. One look, no
 * variants.
 * When to use: how many — selected filters, rows.
 * When not to: a label — use Tag; a state — use Status.
 */
function Badge({ className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded bg-muted px-[5px] text-[11.5px] font-semibold leading-none text-foreground tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
