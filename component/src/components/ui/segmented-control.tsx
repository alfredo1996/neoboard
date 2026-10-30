"use client";

import * as React from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";

import { cn } from "@/lib/utils";

export interface SegmentedControlOption {
  value: string;
  label: React.ReactNode;
}

export interface SegmentedControlProps extends Omit<
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>,
  "type" | "value" | "defaultValue" | "onValueChange" | "children"
> {
  readonly options: readonly SegmentedControlOption[];
  readonly value: string;
  /** Called with the new value. Clicking the selected segment again does nothing. */
  readonly onValueChange: (value: string) => void;
}

/**
 * A short set of mutually exclusive views or presets, shown side by side as a
 * grey track with the selected segment lifted to white and bold (#2218). It is
 * a radio group: one tab stop; the arrow keys move focus between segments and
 * Space or Enter selects the focused one. Clicking the selected segment keeps it
 * selected.
 * When to use: 2–6 short options that change how the same content is shown or
 * filtered — a date-range preset, a chart orientation.
 * When not to: switching between pages of content — use Tabs; a form choice
 * with long labels — use RadioGroup; more than six options — use Select.
 */
const SegmentedControl = React.forwardRef<
  React.ComponentRef<typeof ToggleGroupPrimitive.Root>,
  SegmentedControlProps
>(({ className, options, value, onValueChange, ...props }, ref) => (
  <ToggleGroupPrimitive.Root
    ref={ref}
    type="single"
    value={value}
    onValueChange={(next) => {
      // Radix reports "" when the selected item is clicked again; keep it selected.
      if (next) onValueChange(next);
    }}
    className={cn(
      "flex min-h-8 w-fit max-w-full flex-wrap items-center gap-0.5 rounded-sm bg-active p-0.5 [@media(pointer:coarse)]:gap-y-4",
      className,
    )}
    {...props}
  >
    {options.map((option) => (
      <ToggleGroupPrimitive.Item
        key={option.value}
        value={option.value}
        className="relative inline-flex h-7 shrink-0 items-center justify-center whitespace-nowrap rounded border border-transparent px-3 text-[13px] font-medium text-foreground-2 transition-[color,background-color,border-color] [transition-duration:var(--duration-fast)] [transition-timing-function:var(--ease-standard)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background after:absolute after:inset-0 after:content-[''] [@media(pointer:coarse)]:after:-inset-y-2 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:border-card-edge-hover data-[state=on]:bg-card data-[state=on]:font-semibold data-[state=on]:text-foreground"
      >
        {option.label}
      </ToggleGroupPrimitive.Item>
    ))}
  </ToggleGroupPrimitive.Root>
));
SegmentedControl.displayName = "SegmentedControl";

export { SegmentedControl };
