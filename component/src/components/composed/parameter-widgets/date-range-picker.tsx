"use client";

import * as React from "react";
import { format, subDays, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { Calendar as CalendarIcon, X } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface DateRangeParameterProps {
  parameterName: string;
  /** ISO date string (YYYY-MM-DD) for the start of the range */
  from: string;
  /** ISO date string (YYYY-MM-DD) for the end of the range */
  to: string;
  /** Called when either bound changes. Empty strings mean no selection. */
  onChange: (from: string, to: string) => void;
  className?: string;
}

const DATE_PRESETS = [
  {
    label: "Today",
    getValue: (): { from: Date; to: Date } => {
      const today = new Date();
      return { from: today, to: today };
    },
  },
  {
    label: "Last 7 days",
    getValue: () => ({ from: subDays(new Date(), 6), to: new Date() }),
  },
  {
    label: "Last 30 days",
    getValue: () => ({ from: subDays(new Date(), 29), to: new Date() }),
  },
  {
    label: "This month",
    getValue: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }),
  },
  {
    label: "This year",
    getValue: () => ({ from: startOfYear(new Date()), to: endOfYear(new Date()) }),
  },
];

function toIso(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * Date range picker parameter widget.
 * Sets two ISO date string parameters: {parameterName}_from and {parameterName}_to.
 * Pure presentational — calls onChange with (from, to) ISO strings.
 */
function DateRangeParameter({
  parameterName,
  from,
  to,
  onChange,
  className,
}: DateRangeParameterProps) {
  const [open, setOpen] = React.useState(false);
  const labelId = `param-daterange-label-${parameterName}`;

  // Parse "YYYY-MM-DD" in local time to avoid UTC midnight shift in west-of-UTC timezones
  const fromDate = from
    ? (() => { const [y, m, d] = from.split("-").map(Number); return new Date(y, m - 1, d); })()
    : undefined;
  const toDate = to
    ? (() => { const [y, m, d] = to.split("-").map(Number); return new Date(y, m - 1, d); })()
    : undefined;
  const rangeValue: DateRange | undefined =
    fromDate || toDate ? { from: fromDate, to: toDate } : undefined;

  const hasValue = !!(from || to);

  const handleCalendarSelect = (range: DateRange | undefined) => {
    const newFrom = range?.from ? toIso(range.from) : "";
    const newTo = range?.to ? toIso(range.to) : "";
    onChange(newFrom, newTo);
    if (range?.from && range?.to) setOpen(false);
  };

  const handlePreset = (preset: (typeof DATE_PRESETS)[0]) => {
    const { from: pFrom, to: pTo } = preset.getValue();
    onChange(toIso(pFrom), toIso(pTo));
    setOpen(false);
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label id={labelId} className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {parameterName}
      </Label>
      <div className="flex items-center gap-1">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              aria-labelledby={labelId}
              className={cn(
                "flex-1 justify-start text-left font-normal",
                !hasValue && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
              {fromDate ? (
                toDate ? (
                  <>
                    {format(fromDate, "MMM d, yyyy")} – {format(toDate, "MMM d, yyyy")}
                  </>
                ) : (
                  format(fromDate, "MMM d, yyyy")
                )
              ) : (
                "Pick a date range…"
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <div className="flex">
              <div className="border-r p-2 space-y-1">
                {DATE_PRESETS.map((preset) => (
                  <Button
                    key={preset.label}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-sm"
                    onClick={() => handlePreset(preset)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={fromDate}
                selected={rangeValue}
                onSelect={handleCalendarSelect}
                numberOfMonths={2}
              />
            </div>
          </PopoverContent>
        </Popover>
        {hasValue && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => onChange("", "")}
            aria-label={`Clear ${parameterName}`}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

export { DateRangeParameter };
