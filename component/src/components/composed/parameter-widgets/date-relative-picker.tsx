"use client";

import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type RelativeDatePreset =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "this_month"
  | "this_year";

export interface RelativeDateOption {
  key: RelativeDatePreset;
  label: string;
}

export const RELATIVE_DATE_PRESETS: RelativeDateOption[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last_7_days", label: "Last 7 days" },
  { key: "last_30_days", label: "Last 30 days" },
  { key: "this_month", label: "This month" },
  { key: "this_year", label: "This year" },
];

export interface DateRelativePickerProps {
  parameterName: string;
  /** The currently selected preset key, or empty string for no selection */
  value: RelativeDatePreset | "";
  onChange: (value: RelativeDatePreset | "") => void;
  className?: string;
}

/**
 * Relative date preset picker for a parameter widget.
 * Renders a row of preset buttons. Clicking the active preset deselects it.
 * Pure presentational — calls onChange with the preset key or empty string.
 */
function DateRelativePicker({
  parameterName,
  value,
  onChange,
  className,
}: DateRelativePickerProps) {
  const labelId = `param-daterel-label-${parameterName}`;

  const handleClick = (key: RelativeDatePreset) => {
    // Toggle: clicking the active preset clears it
    onChange(value === key ? "" : key);
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label id={labelId} className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {parameterName}
      </Label>
      <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={labelId}>
        {RELATIVE_DATE_PRESETS.map((preset) => {
          const isActive = value === preset.key;
          return (
            <Button
              key={preset.key}
              type="button"
              size="sm"
              variant={isActive ? "default" : "outline"}
              className={cn(
                "text-xs h-7 px-2.5",
                isActive && "shadow-sm"
              )}
              onClick={() => handleClick(preset.key)}
              aria-pressed={isActive}
            >
              {preset.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export { DateRelativePicker };
