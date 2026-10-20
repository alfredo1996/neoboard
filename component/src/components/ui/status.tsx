import * as React from "react";

import { cn } from "@/lib/utils";

export type StatusTone = "good" | "none" | "pending" | "failed";

// One shape per tone so colour is never the only signal: filled = good,
// hollow = no verdict yet, dashed = checking, square = failed. Colours are the
// semantic tokens (all clear 3:1 on the card in both themes).
const shapes: Record<StatusTone, { name: string; node: React.ReactNode }> = {
  good: {
    name: "filled",
    node: <circle cx="5" cy="5" r="4" fill="hsl(var(--success))" />,
  },
  none: {
    name: "hollow",
    node: (
      <circle
        cx="5"
        cy="5"
        r="3.5"
        fill="none"
        stroke="hsl(var(--muted-foreground))"
        strokeWidth="1.5"
      />
    ),
  },
  pending: {
    name: "dashed",
    node: (
      <circle
        cx="5"
        cy="5"
        r="3.5"
        fill="none"
        stroke="hsl(var(--warning))"
        strokeWidth="1.5"
        strokeDasharray="2.2 1.5"
      />
    ),
  },
  failed: {
    name: "square",
    node: (
      <rect
        x="1.25"
        y="1.25"
        width="7.5"
        height="7.5"
        rx="1"
        fill="hsl(var(--destructive))"
      />
    ),
  },
};

export interface StatusProps extends React.HTMLAttributes<HTMLSpanElement> {
  readonly tone: StatusTone;
}

/**
 * A 10px shape and its word, in the text colour. Only the shape carries
 * colour, and each tone has its own shape. No pill, no pulse.
 * When to use: a state of a thing — connection health, a provider enabled.
 * When not to: a label or category — use Tag; a count — use Badge.
 */
function Status({ tone, className, children, ...props }: StatusProps) {
  const shape = shapes[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[7px] whitespace-nowrap text-[13px] text-foreground",
        className,
      )}
      {...props}
    >
      <svg
        viewBox="0 0 10 10"
        aria-hidden="true"
        data-shape={shape.name}
        className="size-2.5 flex-none overflow-visible"
      >
        {shape.node}
      </svg>
      {children}
    </span>
  );
}

export { Status };
