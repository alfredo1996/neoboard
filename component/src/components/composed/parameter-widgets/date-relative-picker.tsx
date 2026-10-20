"use client";

import { ParamLabel } from "./param-label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
import type { ExternalLabelProps } from "./external-label";

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

export interface DateRelativePickerProps extends ExternalLabelProps {
  parameterName: string;
  /** The currently selected preset key, or empty string for no selection */
  value: RelativeDatePreset | "";
  onChange: (value: RelativeDatePreset | "") => void;
  className?: string;
}

/**
 * Relative date preset picker for a parameter widget.
 * Renders the presets as a SegmentedControl. Clicking the active preset deselects it.
 * Pure presentational — calls onChange with the preset key or empty string.
 */
function DateRelativePicker({
  parameterName,
  value,
  onChange,
  className,
  labelledBy,
  id,
  describedBy,
}: DateRelativePickerProps) {
  const labelId = labelledBy ?? `param-daterel-label-${parameterName}`;

  return (
    <div className={cn("space-y-1.5", className)}>
      {!labelledBy && <ParamLabel parameterName={parameterName} id={labelId} />}
      {/* Clicking the active preset clears it: the control reports "". */}
      <SegmentedControl
        id={id}
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        options={RELATIVE_DATE_PRESETS.map(({ key, label }) => ({
          value: key,
          label,
        }))}
        value={value}
        onValueChange={(next) => onChange(next as RelativeDatePreset | "")}
      />
    </div>
  );
}

export { DateRelativePicker };
