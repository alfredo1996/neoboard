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
  /** Called with the new value, or "" when the selected segment is clicked again. */
  readonly onValueChange: (value: string) => void;
}

/**
 * A short set of mutually exclusive views or presets, shown side by side as a
 * grey track with the selected segment lifted to white and bold (#2218). It is
 * a radio group: one tab stop, arrow keys move between segments.
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
    onValueChange={onValueChange}
    className={cn(
      "inline-flex h-8 max-w-full items-center gap-0.5 overflow-x-auto rounded-sm bg-active p-0.5",
      className,
    )}
    {...props}
  >
    {options.map((option) => (
      <ToggleGroupPrimitive.Item
        key={option.value}
        value={option.value}
        className="inline-flex h-7 shrink-0 items-center justify-center whitespace-nowrap rounded border border-transparent px-3 text-[13px] font-medium text-foreground-2 transition-[color,background-color,border-color] [transition-duration:var(--duration-fast)] [transition-timing-function:var(--ease-standard)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 data-[state=on]:border-card-edge-hover data-[state=on]:bg-field data-[state=on]:font-semibold data-[state=on]:text-foreground"
      >
        {option.label}
      </ToggleGroupPrimitive.Item>
    ))}
  </ToggleGroupPrimitive.Root>
));
SegmentedControl.displayName = "SegmentedControl";

export { SegmentedControl };
